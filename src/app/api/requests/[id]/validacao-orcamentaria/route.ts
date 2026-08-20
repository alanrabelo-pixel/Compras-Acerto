import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { budgetExceptionLevel, budgetExceptionApproverRole, nextAfterValidacaoOrcamentaria } from "@/lib/workflow";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";
import { avancarEtapa, notificarAvancoDeEtapa } from "@/lib/etapa";
import { requireRole } from "@/lib/rbac";
import { checarComprovanteDoFpa } from "@/lib/orcamento-extra";
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

    // O comprovante do FP&A é exigido AQUI TAMBÉM, e não só no ramo da exceção
    // (abaixo). Decisão tomada lendo o que este ramo faz: "há orçamento" numa
    // solicitação aberta como Orçamento Extra é uma contradição, e era a saída
    // mais larga das duas. O ramo da exceção pelo menos grava um
    // BudgetException, com alçada e aprovador; este aqui manda a solicitação
    // direto para Cotação (ou Due Diligence) sem exceção, sem documento e sem
    // nenhum registro de que a compra é extra-orçamentária. Um único booleano
    // no corpo da requisição desligava o controle inteiro.
    //
    // Se a marcação de Orçamento Extra estiver errada (o comprador encontrou
    // uma linha que cobre a compra), a saída não é passar por cima: é anexar a
    // validação do FP&A, ou corrigir a solicitação na origem. Dizer "há
    // orçamento" aqui não desfaz a marcação, só faz a solicitação sair da
    // etapa afirmando duas coisas incompatíveis ao mesmo tempo.
    const checagem = await checarComprovanteDoFpa(request, "antes de avançar a Validação Orçamentária");
    if (!checagem.ok) {
      return NextResponse.json(
        {
          error:
            `${checagem.erro} Se existe linha de orçamento para esta compra, a marcação de Orçamento Extra ` +
            "está errada e precisa ser corrigida na solicitação, não contornada aqui.",
        },
        { status: 422 }
      );
    }

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
    // Exige o comprovante do FP&A e, de quebra, devolve o anexo de "Aprovação
    // Extra-orçamentária" enviado na abertura (Nova Solicitação) para vincular
    // à exceção. Mesma regra do ramo de orçamento disponível acima e da
    // Aprovação do Gestor, concentrada em @/lib/orcamento-extra.
    const checagem = await checarComprovanteDoFpa(request, "antes de registrar a exceção orçamentária");
    if (!checagem.ok) {
      return NextResponse.json({ error: checagem.erro }, { status: 422 });
    }
    const extraBudgetAttachment = checagem.comprovante;

    // A solicitação passa a constar como extra-orçamentária de fato: chegar
    // aqui significa que o comprador concluiu que não há orçamento, mesmo que
    // ninguém tenha marcado a caixa na abertura. Sem isto, o controle inteiro
    // seguiria dependendo de um booleano que o solicitante declara sozinho, e
    // os pontos de cobrança seguintes consultariam um valor que já se sabe
    // errado. Abrir a exceção continua permitido sem o comprovante: quem não
    // marcou Orçamento Extra nunca teve onde anexá-lo, e travar a abertura
    // deixaria a solicitação sem saída. A cobrança é na decisão, abaixo.
    if (!request.extraBudget) {
      await prisma.purchaseRequest.update({ where: { id: request.id }, data: { extraBudget: true } });
    }

    // Primeira chamada: apenas registra a exceção como pendente, na alçada certa.
    const exception = await prisma.budgetException.upsert({
      where: { requestId: request.id },
      update: { level, attachmentId: extraBudgetAttachment?.id },
      create: { requestId: request.id, level, attachmentId: extraBudgetAttachment?.id },
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
  // para seguir, e é aqui que o comprovante do FP&A tem que existir. Vale
  // mesmo sem a marcação de Orçamento Extra na abertura: se a solicitação
  // chegou a ter exceção, ela é extra-orçamentária por definição, e o
  // controle não pode depender do que o solicitante declarou sobre si mesmo.
  // REPROVAR segue livre: recusar não precisa de documento, e exigir aqui
  // deixaria a solicitação presa quando o comprovante nunca vier.
  if (decision === "APROVADO") {
    const checagemDaDecisao = await checarComprovanteDoFpa(
      request,
      "antes de aprovar a exceção orçamentária",
      true
    );
    if (!checagemDaDecisao.ok) {
      return NextResponse.json({ error: checagemDaDecisao.erro }, { status: 422 });
    }
  }
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
