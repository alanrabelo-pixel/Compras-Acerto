import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";
import { PedidoCompraDocument, type PedidoCompraItem } from "@/lib/pdf/pedidoCompra";

/**
 * POST /api/requests/[id]/pedido-compra
 *
 * Gera o Pedido de Compra (dados do fornecedor, itens, condições comerciais)
 * e o PDF correspondente — layout portado do gerador Python/ReportLab já
 * validado pela Acerto (ver src/lib/pdf/pedidoCompra.tsx). Avança para
 * Aguardando Entrega/Conclusão.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: { requester: true },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "PEDIDO_COMPRA") {
    return NextResponse.json({ error: "Solicitação não está na etapa de Pedido de Compra" }, { status: 409 });
  }

  const body = await req.json();
  const {
    actorId, supplierId, supplierLegalName, supplierCnpj, contactName, contactPhone, contactEmail,
    initialValue, negotiatedValue, paymentCondition, installments, currency, needsMeasurement,
    prazoEntrega, localEntrega, frete, items,
  } = body;

  const roleError = await requireRole(actorId, ["COMPRADOR"]);
  if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

  const required = {
    supplierLegalName, supplierCnpj, contactName, contactPhone, contactEmail,
    initialValue, negotiatedValue, paymentCondition, installments, prazoEntrega, localEntrega,
  };
  for (const [key, value] of Object.entries(required)) {
    if (value === undefined || value === null || value === "") {
      return NextResponse.json({ error: `Campo obrigatório ausente: ${key}` }, { status: 400 });
    }
  }

  const itemList: PedidoCompraItem[] = Array.isArray(items) ? items.slice(0, 6) : [];
  if (itemList.length === 0) {
    return NextResponse.json({ error: "Informe ao menos 1 item (máximo de 6)." }, { status: 400 });
  }
  for (const it of itemList) {
    if (!it.descricao || !it.quantidade || it.valorUnitario === undefined) {
      return NextResponse.json({ error: "Cada item precisa de descrição, quantidade e valor unitário." }, { status: 400 });
    }
  }

  const purchaseOrder = await prisma.purchaseOrder.upsert({
    where: { requestId: request.id },
    update: {
      supplierId: supplierId || undefined, supplierLegalName, supplierCnpj, contactName, contactPhone, contactEmail,
      initialValue, negotiatedValue, paymentCondition, installments, currency: currency ?? "BRL",
      needsMeasurement: Boolean(needsMeasurement), prazoEntrega, localEntrega, frete: frete ?? "CIF",
    },
    create: {
      requestId: request.id, supplierId: supplierId || undefined, supplierLegalName, supplierCnpj,
      contactName, contactPhone, contactEmail, initialValue, negotiatedValue, paymentCondition,
      installments, currency: currency ?? "BRL", needsMeasurement: Boolean(needsMeasurement),
      prazoEntrega, localEntrega, frete: frete ?? "CIF",
    },
  });

  // Substitui os itens a cada geração (o formulário sempre envia a lista completa atual).
  await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: purchaseOrder.id } });
  await prisma.purchaseOrderItem.createMany({
    data: itemList.map((it, index) => ({
      purchaseOrderId: purchaseOrder.id,
      descricao: it.descricao,
      quantidade: it.quantidade,
      valorUnitario: it.valorUnitario,
      impostosPercent: it.impostosPercent ?? 0,
      valorTotal: it.valorTotal ?? it.quantidade * it.valorUnitario * (1 + (it.impostosPercent ?? 0) / 100),
      order: index,
    })),
  });

  const buffer = await renderToBuffer(
    <PedidoCompraDocument
      data={{
        code: request.code,
        createdAt: purchaseOrder.createdAt.toISOString(),
        supplierLegalName, supplierCnpj, contactName, contactPhone, contactEmail,
        paymentCondition, installments, currency: currency ?? "BRL",
        prazoEntrega, localEntrega, frete: (frete ?? "CIF") as "CIF" | "FOB",
        items: itemList,
      }}
    />
  );

  const publicDir = path.join(process.cwd(), "public", "pedidos-compra");
  await mkdir(publicDir, { recursive: true });
  await writeFile(path.join(publicDir, `${request.code}.pdf`), buffer);
  const pdfUrl = `/pedidos-compra/${request.code}.pdf`;

  await prisma.purchaseOrder.update({ where: { id: purchaseOrder.id }, data: { pdfUrl } });

  const updated = await prisma.purchaseRequest.update({
    where: { id: request.id },
    data: { currentStage: "AGUARDANDO_ENTREGA" },
  });
  await prisma.stageEvent.create({
    data: { requestId: request.id, fromStage: "PEDIDO_COMPRA", toStage: "AGUARDANDO_ENTREGA", actorId, comment: `Pedido de Compra ${request.code} gerado.` },
  });

  const { subject, html } = templates.pedidoCompraGerado(request.requester.name, request.shortDescription, request.code, `${process.env.APP_URL}${pdfUrl}`);
  await sendPurchaseEmail({ to: request.requester.email, subject, html, requestId: request.id });

  return NextResponse.json({ purchaseOrder: { ...purchaseOrder, pdfUrl }, request: updated }, { status: 201 });
}
