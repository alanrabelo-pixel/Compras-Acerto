import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { nextAfterTesouraria } from "@/lib/workflow";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";

/**
 * PATCH /api/requests/[id]/tesouraria
 *
 * Programação/confirmação de pagamento. Ao confirmar erpConfirmed=true,
 * avança para Mapeamento de Contrato (se needsMapping) ou Concluído.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: { requester: true },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "TESOURARIA") {
    return NextResponse.json({ error: "Solicitação não está na etapa de Tesouraria" }, { status: 409 });
  }

  const body = await req.json();
  const { actorId, scheduledDate, paidDate, status, erpConfirmed } = body;

  const roleError = await requireRole(actorId, ["TESOURARIA"]);
  if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

  await prisma.payment.upsert({
    where: { requestId: request.id },
    update: {
      scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
      paidDate: paidDate ? new Date(paidDate) : undefined,
      status,
      erpConfirmed: Boolean(erpConfirmed),
    },
    create: {
      requestId: request.id,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
      paidDate: paidDate ? new Date(paidDate) : undefined,
      status: status ?? "PROGRAMADO",
      erpConfirmed: Boolean(erpConfirmed),
    },
  });

  if (!erpConfirmed) {
    return NextResponse.json({ status: "PAGAMENTO_PROGRAMADO" });
  }

  const nextStage = nextAfterTesouraria({ needsMapping: Boolean(request.needsMapping) });
  const updated = await prisma.purchaseRequest.update({
    where: { id: request.id },
    data: { currentStage: nextStage, ...(nextStage === "CONCLUIDO" ? { status: "CONCLUIDO" } : {}) },
  });
  await prisma.stageEvent.create({
    data: { requestId: request.id, fromStage: "TESOURARIA", toStage: nextStage, actorId },
  });

  const { subject, html } = templates.atualizacaoEtapa(
    request.requester.name,
    request.shortDescription,
    nextStage === "CONCLUIDO" ? "Concluído" : "Mapeamento de Contrato"
  );
  await sendPurchaseEmail({ to: request.requester.email, subject, html, requestId: request.id });

  return NextResponse.json(updated);
}
