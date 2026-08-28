import { prisma } from "@/lib/db";
import { normalizarCnpj } from "@/lib/cnpj";

export type SupplierHistory = {
  sum: number;
  matchType: "catalog" | "approximate" | "none";
  matchedSupplierName: string | null;
};

/**
 * Soma de Pedidos de Compra do fornecedor indicado nos últimos 12 meses.
 *
 * Extraído de GET /api/requests/[id]/supplier-history (que continua sendo o
 * consumidor principal, para o campo editável na Triagem) para também
 * alimentar o painel de IA da mesma etapa (ver buildTriagemPrompt em
 * src/lib/integrations/ai.ts) sem duplicar a query em dois lugares.
 *
 * Duas camadas de correspondência: catálogo (Supplier cadastrado, soma pelo
 * CNPJ real) e aproximada (nome digitado em Pedidos de Compra anteriores).
 * Nomes de fornecedor variam (razão social x nome fantasia, digitação
 * diferente), então isto é sempre um PONTO DE PARTIDA, nunca a fonte de
 * verdade definitiva.
 */
export async function getSupplierHistory(indicatedSupplierName: string | null | undefined): Promise<SupplierHistory> {
  const name = indicatedSupplierName?.trim();
  if (!name) return { sum: 0, matchType: "none", matchedSupplierName: null };

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const catalogMatch = await prisma.supplier.findFirst({
    where: { OR: [{ legalName: { contains: name, mode: "insensitive" } }, { tradeName: { contains: name, mode: "insensitive" } }] },
  });

  if (catalogMatch) {
    const orders = await prisma.purchaseOrder.findMany({
      where: { supplierCnpj: normalizarCnpj(catalogMatch.cnpj) ?? catalogMatch.cnpj, createdAt: { gte: twelveMonthsAgo } },
      select: { negotiatedValue: true },
    });
    const sum = orders.reduce((acc, o) => acc + Number(o.negotiatedValue), 0);
    return { sum, matchType: "catalog", matchedSupplierName: catalogMatch.legalName };
  }

  const approximateOrders = await prisma.purchaseOrder.findMany({
    where: { supplierLegalName: { contains: name, mode: "insensitive" }, createdAt: { gte: twelveMonthsAgo } },
    select: { negotiatedValue: true, supplierLegalName: true },
  });
  const sum = approximateOrders.reduce((acc, o) => acc + Number(o.negotiatedValue), 0);
  return {
    sum,
    matchType: approximateOrders.length > 0 ? "approximate" : "none",
    matchedSupplierName: approximateOrders[0]?.supplierLegalName ?? null,
  };
}
