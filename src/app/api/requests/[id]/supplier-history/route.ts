import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/requests/[id]/supplier-history
 *
 * Antes, "soma de compras deste fornecedor nos últimos 12 meses" (usada pelo
 * detector de fracionamento em checkFragmentationRisk) era digitada de
 * memória pelo comprador na Triagem — não é uma tarefa de IA, é uma consulta
 * factual que o próprio sistema já pode responder. Como a solicitação ainda
 * não tem um Supplier vinculado nesta etapa (só o texto livre
 * indicatedSupplierName, preenchido na abertura), a busca funciona em duas
 * camadas: primeiro tenta casar com um fornecedor já cadastrado (mais
 * confiável, porque aí soma pelo CNPJ real via Pedido de Compra); se não
 * achar, cai para uma correspondência aproximada pelo nome digitado em
 * Pedidos de Compra anteriores. O valor retornado é sempre um PONTO DE
 * PARTIDA editável no formulário — nunca a fonte de verdade definitiva,
 * porque nomes de fornecedor têm variação (razão social x nome fantasia,
 * digitação diferente) que uma correspondência automática pode não cobrir.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    select: { indicatedSupplierName: true },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });

  const name = request.indicatedSupplierName?.trim();
  if (!name) {
    return NextResponse.json({ sum: 0, matchType: "none", matchedSupplierName: null });
  }

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const catalogMatch = await prisma.supplier.findFirst({
    where: { OR: [{ legalName: { contains: name, mode: "insensitive" } }, { tradeName: { contains: name, mode: "insensitive" } }] },
  });

  if (catalogMatch) {
    const orders = await prisma.purchaseOrder.findMany({
      where: { supplierCnpj: catalogMatch.cnpj, createdAt: { gte: twelveMonthsAgo } },
      select: { negotiatedValue: true },
    });
    const sum = orders.reduce((acc, o) => acc + Number(o.negotiatedValue), 0);
    return NextResponse.json({ sum, matchType: "catalog", matchedSupplierName: catalogMatch.legalName });
  }

  const approximateOrders = await prisma.purchaseOrder.findMany({
    where: { supplierLegalName: { contains: name, mode: "insensitive" }, createdAt: { gte: twelveMonthsAgo } },
    select: { negotiatedValue: true, supplierLegalName: true },
  });
  const sum = approximateOrders.reduce((acc, o) => acc + Number(o.negotiatedValue), 0);
  return NextResponse.json({
    sum,
    matchType: approximateOrders.length > 0 ? "approximate" : "none",
    matchedSupplierName: approximateOrders[0]?.supplierLegalName ?? null,
  });
}
