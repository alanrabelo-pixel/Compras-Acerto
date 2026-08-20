import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { budgetExceptionLevel, budgetExceptionApproverRole, nextAfterValidacaoOrcamentaria } from "@/lib/workflow";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";
import { avancarEtapa, notificarAvancoDeEtapa } from "@/lib/etapa";
import { requireRole } from "@/lib/rbac";
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
    // Vincula automaticamente o anexo de "Aprovação Extra-orçamentária" já
    // enviado na abertura da solicitação (Nova Solicitação), se existir.
    const extraBudgetAttachment = await prisma.attachment.findFirst({
      where: { requestId: request.id, category: "APROVACAO_EXTRA_ORCAMENTARIA" },
      orderBy: { createdAt: "desc" },
    });

    // O comprovante era exigido apenas no formulário: a API criava a exceção
    // com attachmentId undefined e seguia. Uma chamada direta, ou um upload que
    // falhasse depois da criação da solicitação, produzia exceção orçamentária
    // sem documento que a sustentasse.
    //
    // A checagem fica aqui, e não na criação da solicitação, por uma restrição
    // real do fluxo: o anexo só pode ser enviado DEPOIS que a solicitação
    // existe, porque a rota de upload precisa do id dela. Exigir na criação
    // quebraria o próprio formulário. Aqui é o primeiro momento em que o
    // documento pode existir e onde ele de fato importa.
    if (request.extraBudget && !extraBudgetAttachment) {
      return NextResponse.json(
        {
          error:
            "Esta solicitação foi aberta como Orçamento Extra e ainda não tem o comprovante de aprovação do FP&A anexado. " +
            "Anexe o documento na solicitação antes de registrar a exceção orçamentária.",
        },
        { status: 422 }
      );
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
