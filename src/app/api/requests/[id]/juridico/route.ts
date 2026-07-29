import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";

/**
 * PATCH /api/requests/[id]/juridico
 *
 * Elaboração/assinatura da minuta contratual. Só avança para Pedido de
 * Compra quando o documento estiver assinado (signed = true).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: { requester: true },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "JURIDICO") {
    return NextResponse.json({ error: "Solicitação não está na etapa de Jurídico" }, { status: 409 });
  }

  const body = await req.json();
  const { actorId, minutaUrl, signedDocUrl, signed, observations } = body;

  const roleError = await requireRole(actorId, ["JURIDICO"]);
  if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

  await prisma.legalReview.upsert({
    where: { requestId: request.id },
    update: { minutaUrl, signedDocUrl, signed, observations, decidedAt: signed ? new Date() : undefined },
    create: { requestId: request.id, minutaUrl, signedDocUrl, signed, observations, decidedAt: signed ? new Date() : undefined },
  });

  if (!signed) {
    return NextResponse.json({ status: "MINUTA_EM_ANDAMENTO" });
  }

  // CANCELAMENTO não compra nada e não mapeia contrato novo — o contrato já
  // existe e já está mapeado (pedido do usuário); depois de assinado o
  // distrato/termo de cancelamento, encerra direto. A baixa do contrato em si
  // (status CANCELADO) é feita separadamente em Contratos, ação CANCELAR
  // (ver /api/contracts/[id]), não faz parte deste fluxo de solicitação.
  const isCancelamento = request.demandType === "CANCELAMENTO";
  const nextStage = isCancelamento ? "CONCLUIDO" : "PEDIDO_COMPRA";
  const nextLabel = isCancelamento ? "Concluído" : "Pedido de Compra";

  const updated = await prisma.purchaseRequest.update({
    where: { id: request.id },
    data: { currentStage: nextStage, ...(isCancelamento ? { status: "CONCLUIDO" } : {}) },
  });
  await prisma.stageEvent.create({
    data: { requestId: request.id, fromStage: "JURIDICO", toStage: nextStage, actorId },
  });

  const { subject, html } = templates.atualizacaoEtapa(request.requester.name, request.shortDescription, nextLabel);
  await sendPurchaseEmail({ to: request.requester.email, subject, html, requestId: request.id });

  return NextResponse.json(updated);
}
