import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";

/**
 * PATCH /api/requests/[id]/due-diligence
 *
 * Due Diligence de Privacidade/Segurança — obrigatório para Ferramenta Nova
 * (ou quando handlesPersonalData foi marcado na Triagem). Decisão exclusiva
 * do papel PRIVACIDADE. Se aprovado -> Cotação; se reprovado -> Cancelado.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { decidedBy, approved, justification } = body;

  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: { requester: true },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "DUE_DILIGENCE") {
    return NextResponse.json({ error: "Solicitação não está na etapa de Due Diligence" }, { status: 409 });
  }

  const roleError = await requireRole(decidedBy, ["PRIVACIDADE"]);
  if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

  await prisma.dueDiligenceReview.upsert({
    where: { requestId: request.id },
    update: { approved, justification, decidedAt: new Date() },
    create: { requestId: request.id, approved, justification, decidedAt: new Date() },
  });

  const nextStage = approved ? "COTACAO" : "CANCELADO";
  const updated = await prisma.purchaseRequest.update({
    where: { id: request.id },
    data: {
      currentStage: nextStage,
      ...(approved ? {} : { status: "CANCELADO", cancelReason: justification ?? "Reprovado em Due Diligence" }),
    },
  });
  await prisma.stageEvent.create({
    data: { requestId: request.id, fromStage: "DUE_DILIGENCE", toStage: nextStage, actorId: decidedBy, comment: justification },
  });

  const { subject, html } = approved
    ? templates.atualizacaoEtapa(request.requester.name, request.shortDescription, "Cotação")
    : templates.reprovado(request.requester.name, request.shortDescription, justification ?? "reprovado em Due Diligence");
  await sendPurchaseEmail({ to: request.requester.email, subject, html, requestId: request.id });

  return NextResponse.json(updated);
}
