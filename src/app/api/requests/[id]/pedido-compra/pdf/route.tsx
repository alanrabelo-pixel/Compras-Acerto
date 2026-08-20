import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { exigirLeituraDeSolicitacao } from "@/lib/acesso";
import { PedidoCompraDocument } from "@/lib/pdf/pedidoCompra";

export const runtime = "nodejs";

// GET /api/requests/[id]/pedido-compra/pdf: gera o PDF do Pedido de Compra sob demanda.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const barrado = await exigirLeituraDeSolicitacao(params.id);
  if (barrado) return barrado;

  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: { purchaseOrder: { include: { items: { orderBy: { order: "asc" } } } } },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (!request.purchaseOrder) {
    return NextResponse.json({ error: "Pedido de Compra ainda não foi gerado para esta solicitação." }, { status: 404 });
  }

  const po = request.purchaseOrder;

  const buffer = await renderToBuffer(
    <PedidoCompraDocument
      data={{
        code: request.code,
        createdAt: po.createdAt.toISOString(),
        supplierLegalName: po.supplierLegalName,
        supplierCnpj: po.supplierCnpj,
        contactName: po.contactName,
        contactPhone: po.contactPhone,
        contactEmail: po.contactEmail,
        paymentCondition: po.paymentCondition,
        installments: po.installments,
        currency: po.currency,
        prazoEntrega: po.prazoEntrega ?? "",
        localEntrega: po.localEntrega ?? "",
        frete: po.frete,
        items: po.items.map((it) => ({
          descricao: it.descricao,
          quantidade: Number(it.quantidade),
          valorUnitario: Number(it.valorUnitario),
          impostosPercent: Number(it.impostosPercent),
          valorTotal: Number(it.valorTotal),
        })),
      }}
    />
  );

  if (!po.pdfUrl) {
    await prisma.purchaseOrder.update({
      where: { requestId: request.id },
      data: { pdfUrl: `/api/requests/${request.id}/pedido-compra/pdf` },
    });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="pedido-compra-${request.code}.pdf"`,
    },
  });
}
