import { prisma } from "@/lib/db";

export type CostCenterSpendHistory = {
  sum: number;
  count: number;
  averageValue: number;
};

/**
 * Gasto real (Pedidos de Compra já negociados, não estimativa) do centro de
 * custo nos últimos 12 meses. Usada para dar ao aprovador uma referência de
 * "isto é normal para este centro de custo?" (ver buildApprovalSummaryPrompt
 * em src/lib/integrations/ai.ts) em vez de decidir olhando só o valor
 * isolado da solicitação. Mesmo recorte de "últimos 12 meses" e mesma fonte
 * (PurchaseOrder.negotiatedValue) usados em getSupplierHistory, só que
 * agrupado por centro de custo em vez de por fornecedor.
 */
export async function getCostCenterSpendHistory(costCenterId: string): Promise<CostCenterSpendHistory> {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const orders = await prisma.purchaseOrder.findMany({
    where: { request: { costCenterId }, createdAt: { gte: twelveMonthsAgo } },
    select: { negotiatedValue: true },
  });

  const sum = orders.reduce((acc, o) => acc + Number(o.negotiatedValue), 0);
  return { sum, count: orders.length, averageValue: orders.length > 0 ? sum / orders.length : 0 };
}
