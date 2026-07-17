import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  approvalLevel,
  canPersonifyApprover,
  nextAfterAprovacao,
  violatesSegregationOfDuties,
  APPROVAL_ESCALATION_BUSINESS_DAYS,
} from "@/lib/workflow";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";
import { sendSlackDM } from "@/lib/integrations/slack";
import { requireRole } from "@/lib/rbac";

/**
 * POST /api/requests/[id]/aprovacao
 *
 * Cria o registro de aprovação na alçada correta (Nível 1/2/3, renumerado na
 * revisão v1.1) e define o prazo (dueAt) para escalonamento automático.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const request = await prisma.purchaseRequest.findUnique({ where: { id: params.id } });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "APROVACAO") {
    return NextResponse.json({ error: "Solicitação não está na etapa de Aprovação" }, { status: 409 });
  }

  const body = await req.json();

  const roleError = await requireRole(body.approverId, ["APROVADOR"]);
  if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

  // Revisão v1.1: declaração de conflito de interesse é obrigatória antes da
  // Aprovação (ver ConflictOfInterestDeclaration no schema). Bloqueia se ainda
  // não foi declarada, ou se foi declarada COM conflito (exige reatribuição).
  const declaration = await prisma.conflictOfInterestDeclaration.findFirst({
    where: { requestId: request.id },
    orderBy: { createdAt: "desc" },
  });
  if (!declaration) {
    return NextResponse.json(
      { error: "Declaração de conflito de interesse ainda não foi registrada para esta solicitação." },
      { status: 422 }
    );
  }
  if (declaration.hasConflict) {
    return NextResponse.json(
      { error: "Há conflito de interesse declarado — reatribua solicitante/comprador/aprovador antes de prosseguir." },
      { status: 422 }
    );
  }

  const level = approvalLevel(Number(request.estimatedValue));
  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + APPROVAL_ESCALATION_BUSINESS_DAYS);

  const approval = await prisma.approval.create({
    data: { requestId: request.id, level, approverId: body.approverId, dueAt },
  });

  return NextResponse.json(approval, { status: 201 });
}

/**
 * PATCH /api/requests/[id]/aprovacao
 *
 * Decisão do aprovador (ou personificação controlada pelo comprador — revisão
 * v1.1: só permitida até o Nível 1 / R$ 50 mil).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { approvalId, decision, justification, personifiedBy } = body;

  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: { requester: true },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });

  const approval = await prisma.approval.findUnique({ where: { id: approvalId } });
  if (!approval || approval.requestId !== request.id) {
    return NextResponse.json({ error: "Aprovação não encontrada para esta solicitação" }, { status: 404 });
  }

  if (personifiedBy) {
    const sodViolation = violatesSegregationOfDuties({ requesterId: request.requesterId, buyerId: personifiedBy });
    if (sodViolation) return NextResponse.json({ error: sodViolation }, { status: 422 });

    const roleError = await requireRole(personifiedBy, ["COMPRADOR"]);
    if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

    if (!canPersonifyApprover(Number(request.estimatedValue))) {
      return NextResponse.json(
        { error: "Personificação de aprovador só é permitida até o Nível 1 (R$ 50 mil). Este valor exige decisão do aprovador real." },
        { status: 422 }
      );
    }
    if (!justification) {
      return NextResponse.json({ error: "Justificativa é obrigatória ao personificar um aprovador." }, { status: 422 });
    }
  }

  await prisma.approval.update({
    where: { id: approvalId },
    data: { decision, justification, personifiedBy: personifiedBy ?? null, decidedAt: new Date() },
  });

  // Se personificado, notifica o aprovador real (transparência — não substitui a auditoria)
  if (personifiedBy) {
    const approver = await prisma.user.findUnique({ where: { id: approval.approverId } });
    if (approver) {
      await sendSlackDM({
        slackUserEmail: approver.email,
        text: `A solicitação ${request.code} foi ${decision === "APROVADO" ? "aprovada" : "reprovada"} em seu nome pelo comprador, por urgência/ausência. Justificativa: ${justification}`,
        requestId: request.id,
      }).catch(() => {});
    }
  }

  if (decision === "REPROVADO") {
    const nextStage = nextAfterAprovacao({ approved: false, needsContract: Boolean(request.needsContract) });
    await prisma.purchaseRequest.update({
      where: { id: request.id },
      data: { currentStage: nextStage, status: "CANCELADO", cancelReason: justification },
    });
    await prisma.stageEvent.create({
      data: { requestId: request.id, fromStage: "APROVACAO", toStage: nextStage, comment: justification },
    });
    const { subject, html } = templates.reprovado(request.requester.name, request.shortDescription, justification ?? "não informado");
    await sendPurchaseEmail({ to: request.requester.email, subject, html, requestId: request.id });
    return NextResponse.json({ status: "REPROVADO" });
  }

  const nextStage = nextAfterAprovacao({ approved: true, needsContract: Boolean(request.needsContract) });
  const updated = await prisma.purchaseRequest.update({
    where: { id: request.id },
    data: { currentStage: nextStage },
  });
  await prisma.stageEvent.create({
    data: { requestId: request.id, fromStage: "APROVACAO", toStage: nextStage },
  });
  const { subject, html } = templates.aprovado(request.requester.name, request.shortDescription);
  await sendPurchaseEmail({ to: request.requester.email, subject, html, requestId: request.id });

  return NextResponse.json(updated);
}
