import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { budgetExceptionLevel, budgetExceptionApproverRole, nextAfterValidacaoOrcamentaria } from "@/lib/workflow";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";
import { requireRole } from "@/lib/rbac";

/**
 * PATCH /api/requests/[id]/validacao-orcamentaria
 *
 * Documento de referência: se há orçamento disponível, segue direto (Cotação ou
 * Due Diligence se Ferramenta Nova). Se não há, abre o workflow de exceção por
 * alçada (Nível 1/2/3 conforme valor) — só sai desta etapa quando a exceção for
 * decidida.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { budgetOk, actorId, observation, exceptionDecision, exceptionApproverId, justification } = body;

  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: { requester: true },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "VALIDACAO_ORCAMENTARIA") {
    return NextResponse.json({ error: "Solicitação não está na etapa de Validação Orçamentária" }, { status: 409 });
  }

  // Caminho 1: há orçamento — segue direto, sem passar pelo workflow de exceção.
  if (budgetOk) {
    const roleError = await requireRole(actorId, ["COMPRADOR"]);
    if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

    const nextStage = nextAfterValidacaoOrcamentaria({ budgetOk: true, demandType: request.demandType });
    const updated = await prisma.purchaseRequest.update({
      where: { id: request.id },
      data: { currentStage: nextStage },
    });
    await prisma.stageEvent.create({
      data: { requestId: request.id, fromStage: "VALIDACAO_ORCAMENTARIA", toStage: nextStage, actorId, comment: observation || undefined },
    });
    const { subject, html } = templates.atualizacaoEtapa(
      request.requester.name,
      request.shortDescription,
      nextStage === "DUE_DILIGENCE" ? "Due Diligence" : "Cotação"
    );
    await sendPurchaseEmail({ to: request.requester.email, subject, html, requestId: request.id });
    return NextResponse.json(updated);
  }

  // Caminho 2: sem orçamento — cria ou atualiza a exceção orçamentária.
  // A Triagem já exige estimatedValue preenchido antes de chegar aqui (ver
  // rota de triagem) — este guard é só defesa em profundidade.
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

    // Primeira chamada: apenas registra a exceção como pendente, na alçada certa.
    const exception = await prisma.budgetException.upsert({
      where: { requestId: request.id },
      update: { level, attachmentId: extraBudgetAttachment?.id },
      create: { requestId: request.id, level, attachmentId: extraBudgetAttachment?.id },
    });
    return NextResponse.json({ status: "EXCECAO_PENDENTE", exception });
  }

  // Segunda chamada: decisão do aprovador da exceção — papel exigido varia
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
    await prisma.purchaseRequest.update({
      where: { id: request.id },
      data: { currentStage: "CANCELADO", status: "CANCELADO", cancelReason: justification },
    });
    await prisma.stageEvent.create({
      data: { requestId: request.id, fromStage: "VALIDACAO_ORCAMENTARIA", toStage: "CANCELADO", actorId: exceptionApproverId, comment: justification },
    });
    const { subject, html } = templates.reprovado(request.requester.name, request.shortDescription, justification ?? "indisponibilidade de orçamento");
    await sendPurchaseEmail({ to: request.requester.email, subject, html, requestId: request.id });
    return NextResponse.json({ status: "REPROVADO" });
  }

  const nextStage = nextAfterValidacaoOrcamentaria({ budgetOk: true, demandType: request.demandType });
  const updated = await prisma.purchaseRequest.update({
    where: { id: request.id },
    data: { currentStage: nextStage },
  });
  await prisma.stageEvent.create({
    data: { requestId: request.id, fromStage: "VALIDACAO_ORCAMENTARIA", toStage: nextStage, actorId: exceptionApproverId, comment: justification },
  });
  return NextResponse.json(updated);
}
