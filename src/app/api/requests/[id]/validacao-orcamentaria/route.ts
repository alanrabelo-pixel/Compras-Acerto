import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { budgetExceptionLevel, budgetExceptionApproverRole, nextAfterValidacaoOrcamentaria } from "@/lib/workflow";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";
import { avancarEtapa, notificarAvancoDeEtapa } from "@/lib/etapa";
import { requireRole } from "@/lib/rbac";
import { anexoDeApoioDoOrcamento } from "@/lib/orcamento-extra";
import { USUARIO_PUBLICO } from "@/lib/usuario";

/**
 * PATCH /api/requests/[id]/validacao-orcamentaria
 *
 * Documento de referência: se há orçamento disponível, segue direto (Cotação ou
 * Due Diligence se Ferramenta Nova). Se não há, abre o workflow de exceção por
 * alçada (Nível 1/2/3 conforme valor); só sai desta etapa quando a exceção for
 * decidida.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { budgetOk, actorId, observation, exceptionDecision, exceptionApproverId, justification } = body;

  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: { requester: { select: USUARIO_PUBLICO } },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "VALIDACAO_ORCAMENTARIA") {
    return NextResponse.json({ error: "Solicitação não está na etapa de Validação Orçamentária" }, { status: 409 });
  }

  // Caminho 1: há orçamento, segue direto, sem passar pelo workflow de exceção.
  if (budgetOk) {
    const roleError = await requireRole(actorId, ["COMPRADOR"]);
    if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

    // Este ramo já exigiu o comprovante do FP&A. A exigência caiu em
    // 21/08/2026, com as outras quatro, quando o registro da aprovação passou
    // a ser o próprio sistema (ver @/lib/orcamento-extra).
    //
    // FICA REGISTRADO O QUE A REMOÇÃO REABRIU, porque não é nada: este ramo
    // manda a solicitação direto para Cotação sem criar BudgetException, então
    // uma compra marcada como Orçamento Extra pode sair daqui sem exceção e
    // sem registro de que é extra-orçamentária. Isso já era assim antes do
    // comprovante existir, e o comprovante nunca corrigiu: ele só pedia um
    // arquivo. Quem fecha esse caminho é o comprador, respondendo "não há
    // orçamento" quando de fato não há, e a coerência disso não é verificável
    // por código. Se um dia incomodar, o conserto é impedir budgetOk=true numa
    // solicitação com extraBudget=true, não pedir documento.
    const nextStage = nextAfterValidacaoOrcamentaria({ budgetOk: true, demandType: request.demandType });

    const avanco = await avancarEtapa({
      requestId: request.id,
      de: "VALIDACAO_ORCAMENTARIA",
      para: nextStage,
      actorId,
      comentario: observation || null,
    });
    if (!avanco.ok) {
      return NextResponse.json({ error: avanco.erro }, { status: avanco.status });
    }
    await notificarAvancoDeEtapa(avanco.solicitacao, nextStage);
    return NextResponse.json(avanco.solicitacao);
  }

  // Caminho 2: sem orçamento, cria ou atualiza a exceção orçamentária.
  // A Triagem já exige estimatedValue preenchido antes de chegar aqui (ver
  // rota de triagem); este guard é só defesa em profundidade.
  if (request.estimatedValue === null) {
    return NextResponse.json({ error: "Valor estimado ainda não foi preenchido nesta solicitação." }, { status: 409 });
  }
  const level = budgetExceptionLevel(Number(request.estimatedValue));

  if (!exceptionDecision) {
    // Vincula à exceção o documento de apoio, SE existir. Deixou de ser
    // exigência em 21/08/2026 (ver @/lib/orcamento-extra); continua vinculado
    // porque, quando alguém anexa algo, o lugar certo do arquivo é junto da
    // exceção a que ele se refere.
    const anexoDeApoio = await anexoDeApoioDoOrcamento(request.id);

    // A solicitação passa a constar como extra-orçamentária de fato: chegar
    // aqui significa que o comprador concluiu que não há orçamento, mesmo que
    // ninguém tenha marcado a caixa na abertura. Sem isto, o registro seguiria
    // dependendo de um booleano que o solicitante declara sozinho.
    if (!request.extraBudget) {
      await prisma.purchaseRequest.update({ where: { id: request.id }, data: { extraBudget: true } });
    }

    // Primeira chamada: apenas registra a exceção como pendente, na alçada certa.
    const exception = await prisma.budgetException.upsert({
      where: { requestId: request.id },
      update: { level, attachmentId: anexoDeApoio?.id },
      create: { requestId: request.id, level, attachmentId: anexoDeApoio?.id },
    });
    return NextResponse.json({ status: "EXCECAO_PENDENTE", exception });
  }

  // Segunda chamada: decisão do aprovador da exceção. Papel exigido varia
  // pela alçada (ver budgetExceptionApproverRole em workflow.ts).
  const requiredRole = budgetExceptionApproverRole(level);
  const roleError = await requireRole(exceptionApproverId, [requiredRole]);
  if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

  const decision = exceptionDecision as "APROVADO" | "REPROVADO";

  // APROVAR a exceção é o ponto em que a compra sem orçamento fica liberada
  // para seguir, e era aqui que o comprovante do FP&A tinha que existir. Essa
  // exigência caiu em 21/08/2026, e este é justamente o ponto que explica por
  // quê: o update logo abaixo grava decisão, quem decidiu (pelo papel exigido
  // acima, conforme a alçada), a justificativa e a data. Esse registro É a
  // aprovação. Pedir, além dele, o print de um e-mail em que alguém aprovou a
  // mesma coisa por fora era duplicar a prova, e a cópia era a pior das duas.
  await prisma.budgetException.update({
    where: { requestId: request.id },
    data: { decision, justification, decidedAt: new Date() },
  });

  if (decision === "REPROVADO") {
    const cancelamento = await avancarEtapa({
      requestId: request.id,
      de: "VALIDACAO_ORCAMENTARIA",
      para: "CANCELADO",
      actorId: exceptionApproverId,
      comentario: justification,
      dadosExtras: { status: "CANCELADO", cancelReason: justification },
    });
    if (!cancelamento.ok) {
      return NextResponse.json({ error: cancelamento.erro }, { status: cancelamento.status });
    }
    // Template de reprovação, não o de avanço de etapa: aqui a solicitação
    // termina, não segue adiante.
    const { subject, html } = templates.reprovado(request.requester.name, request.shortDescription, justification ?? "indisponibilidade de orçamento");
    await sendPurchaseEmail({ to: request.requester.email, subject, html, requestId: request.id });
    return NextResponse.json({ status: "REPROVADO" });
  }

  const nextStage = nextAfterValidacaoOrcamentaria({ budgetOk: true, demandType: request.demandType });

  // Nota: este caminho (exceção APROVADA) não envia aviso ao solicitante,
  // diferente do caminho de orçamento OK acima. A assimetria é anterior a esta
  // mudança e está registrada como achado da auditoria; não alterei aqui para
  // não mudar quem recebe e-mail junto com um refactor de transação.
  const avanco = await avancarEtapa({
    requestId: request.id,
    de: "VALIDACAO_ORCAMENTARIA",
    para: nextStage,
    actorId: exceptionApproverId,
    comentario: justification,
  });
  if (!avanco.ok) {
    return NextResponse.json({ error: avanco.erro }, { status: avanco.status });
  }
  return NextResponse.json(avanco.solicitacao);
}
