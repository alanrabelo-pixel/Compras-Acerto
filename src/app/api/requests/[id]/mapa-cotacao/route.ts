import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";

/**
 * PATCH /api/requests/[id]/mapa-cotacao
 *
 * Seleciona a cotação vencedora (saving % / $ calculado a partir de
 * initialValue x negotiatedValue) e avança para Aprovação.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: { requester: true },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "MAPA_COTACAO") {
    return NextResponse.json({ error: "Solicitação não está na etapa de Mapa de Cotação" }, { status: 409 });
  }

  const body = await req.json();
  const { actorId, selectedQuoteId } = body;

  const roleError = await requireRole(actorId, ["COMPRADOR"]);
  if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

  const quote = await prisma.quote.findUnique({ where: { id: selectedQuoteId } });
  if (!quote || quote.requestId !== request.id) {
    return NextResponse.json({ error: "Cotação selecionada não encontrada para esta solicitação." }, { status: 404 });
  }

  await prisma.quote.updateMany({ where: { requestId: request.id }, data: { selected: false } });
  await prisma.quote.update({ where: { id: quote.id }, data: { selected: true } });

  const updated = await prisma.purchaseRequest.update({ where: { id: request.id }, data: { currentStage: "APROVACAO" } });
  await prisma.stageEvent.create({
    data: {
      requestId: request.id,
      fromStage: "MAPA_COTACAO",
      toStage: "APROVACAO",
      actorId,
      comment: `Fornecedor vencedor: ${quote.supplierName}`,
    },
  });

  const { subject, html } = templates.atualizacaoEtapa(request.requester.name, request.shortDescription, "Aprovação");
  await sendPurchaseEmail({ to: request.requester.email, subject, html, requestId: request.id });

  return NextResponse.json(updated);
}
