import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { minimumQuotesRequired } from "@/lib/workflow";
import { requireRole } from "@/lib/rbac";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";

/**
 * POST /api/requests/[id]/cotacao — adiciona uma cotação (uma chamada por
 * fornecedor cotado). GET lista as cotações já registradas. PATCH avança
 * para o Mapa de Cotação, respeitando o número mínimo de cotações por faixa
 * de valor (ver minimumQuotesRequired em workflow.ts).
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const quotes = await prisma.quote.findMany({ where: { requestId: params.id }, orderBy: { createdAt: "asc" } });
  return NextResponse.json(quotes);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const request = await prisma.purchaseRequest.findUnique({ where: { id: params.id } });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "COTACAO") {
    return NextResponse.json({ error: "Solicitação não está na etapa de Cotação" }, { status: 409 });
  }

  const body = await req.json();
  const { addedBy, supplierId, supplierName, initialValue, negotiatedValue, paymentCondition, currency } = body;

  const roleError = await requireRole(addedBy, ["COMPRADOR"]);
  if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

  if (!supplierName || initialValue === undefined || negotiatedValue === undefined || !paymentCondition) {
    return NextResponse.json({ error: "Campos obrigatórios: supplierName, initialValue, negotiatedValue, paymentCondition." }, { status: 400 });
  }

  const quote = await prisma.quote.create({
    data: {
      requestId: request.id,
      supplierId: supplierId || undefined,
      supplierName,
      initialValue,
      negotiatedValue,
      paymentCondition,
      currency: currency ?? "BRL",
    },
  });

  return NextResponse.json(quote, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: { requester: true },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "COTACAO") {
    return NextResponse.json({ error: "Solicitação não está na etapa de Cotação" }, { status: 409 });
  }

  const body = await req.json();
  const roleError = await requireRole(body.actorId, ["COMPRADOR"]);
  if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

  const quotes = await prisma.quote.findMany({ where: { requestId: request.id } });
  const required = minimumQuotesRequired(Number(request.estimatedValue));
  if (quotes.length < required) {
    return NextResponse.json(
      { error: `Mínimo de ${required} cotação(ões) exigido para este valor — ${quotes.length} registrada(s).` },
      { status: 422 }
    );
  }

  const updated = await prisma.purchaseRequest.update({ where: { id: request.id }, data: { currentStage: "MAPA_COTACAO" } });
  await prisma.stageEvent.create({
    data: { requestId: request.id, fromStage: "COTACAO", toStage: "MAPA_COTACAO", actorId: body.actorId },
  });

  const { subject, html } = templates.atualizacaoEtapa(request.requester.name, request.shortDescription, "Mapa de Cotação");
  await sendPurchaseEmail({ to: request.requester.email, subject, html, requestId: request.id });

  return NextResponse.json(updated);
}
