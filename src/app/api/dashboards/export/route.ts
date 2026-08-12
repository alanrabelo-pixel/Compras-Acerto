import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { STAGES } from "@/lib/workflow";
import { buildDashboardWhere } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

/**
 * Exporta em Excel toda a base de dados movimentada no processo, recortada
 * pelos mesmos filtros da tela de Dashboards (ver src/app/dashboards/page.tsx
 * e DashboardFilters.tsx — os nomes dos parâmetros de URL são idênticos de
 * propósito, para o recorte do relatório bater com o que está na tela).
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const de = sp.get("de");
  const ate = sp.get("ate");
  const where = buildDashboardWhere({
    diretoria: sp.get("diretoria") ?? undefined,
    costCenterId: sp.get("costCenterId") ?? undefined,
    demandType: sp.get("demandType") ?? undefined,
    stage: sp.get("stage") ?? undefined,
    status: sp.get("status") ?? undefined,
    buyerId: sp.get("buyerId") ?? undefined,
    supplierId: sp.get("supplierId") ?? undefined,
  });
  if (de || ate) {
    where.createdAt = {
      ...(de ? { gte: new Date(de) } : {}),
      ...(ate ? { lte: new Date(`${ate}T23:59:59`) } : {}),
    };
  }

  const requests = await prisma.purchaseRequest.findMany({
    where,
    include: { costCenter: true, requester: true, buyer: true },
    orderBy: { createdAt: "desc" },
  });
  const requestIds = requests.map((r) => r.id);
  const requestCodeById = new Map(requests.map((r) => [r.id, r.code]));

  const [purchaseOrders, contracts, budgetExceptions, approvals] = await Promise.all([
    prisma.purchaseOrder.findMany({ where: { requestId: { in: requestIds } } }),
    prisma.contract.findMany({ where: { requestId: { in: requestIds } }, include: { contractManager: true } }),
    prisma.budgetException.findMany({ where: { requestId: { in: requestIds } } }),
    prisma.approval.findMany({ where: { requestId: { in: requestIds } }, include: { approver: true } }),
  ]);

  const wb = XLSX.utils.book_new();

  const solicitacoesSheet = XLSX.utils.json_to_sheet(
    requests.map((r) => ({
      "Código": r.code,
      "Descrição": r.shortDescription,
      "Diretoria": r.diretoria,
      "Centro de Custo": r.costCenter.name,
      "Tipo de Demanda": r.demandType,
      "Prioridade": r.priority,
      "Etapa Atual": STAGES[r.currentStage]?.label ?? r.currentStage,
      "Status": r.status,
      "Valor Estimado": r.estimatedValue ? Number(r.estimatedValue) : "",
      "Solicitante": r.requester.name,
      "Comprador": r.buyer?.name ?? "",
      "Risco de Fracionamento": r.fragmentationFlag ? "Sim" : "Não",
      "Criada em": r.createdAt.toISOString().slice(0, 10),
    }))
  );
  XLSX.utils.book_append_sheet(wb, solicitacoesSheet, "Solicitações");

  const pedidosSheet = XLSX.utils.json_to_sheet(
    purchaseOrders.map((po) => ({
      "Solicitação": requestCodeById.get(po.requestId) ?? po.requestId,
      "Fornecedor": po.supplierLegalName,
      "Valor Inicial": Number(po.initialValue),
      "Valor Negociado": Number(po.negotiatedValue),
      "Saving": Number(po.initialValue) - Number(po.negotiatedValue),
      "Condição de Pagamento": po.paymentCondition ?? "",
      "Emitido em": po.createdAt.toISOString().slice(0, 10),
    }))
  );
  XLSX.utils.book_append_sheet(wb, pedidosSheet, "Pedidos de Compra");

  const contratosSheet = XLSX.utils.json_to_sheet(
    contracts.map((c) => ({
      "Razão Social": c.supplierName,
      "Nome Fantasia": c.supplierTradeName ?? "",
      "CNPJ": c.supplierCnpj ?? "",
      "Status": c.status,
      "Início da Vigência": c.startDate.toISOString().slice(0, 10),
      "Fim da Vigência": c.endDate.toISOString().slice(0, 10),
      "Renovação Prevista": c.renewalDate.toISOString().slice(0, 10),
      "Área": c.area,
      "Centro de Custo": c.costCenter,
      "Gestor Responsável": c.contractManager.name,
      "E-mail do Gestor": c.contractManager.email,
    }))
  );
  XLSX.utils.book_append_sheet(wb, contratosSheet, "Contratos");

  const excecoesSheet = XLSX.utils.json_to_sheet(
    budgetExceptions.map((b) => ({
      "Solicitação": requestCodeById.get(b.requestId) ?? b.requestId,
      "Justificativa": b.justification,
      "Decisão": b.decision,
      "Decidida em": b.decidedAt ? b.decidedAt.toISOString().slice(0, 10) : "",
    }))
  );
  XLSX.utils.book_append_sheet(wb, excecoesSheet, "Exceções Orçamentárias");

  const aprovacoesSheet = XLSX.utils.json_to_sheet(
    approvals.map((a) => ({
      "Solicitação": requestCodeById.get(a.requestId) ?? a.requestId,
      "Aprovador": a.approver?.name ?? "",
      "Decisão": a.decision,
      "Personificada": a.personifiedBy ? "Sim" : "Não",
      "Decidida em": a.decidedAt ? a.decidedAt.toISOString().slice(0, 10) : "",
    }))
  );
  XLSX.utils.book_append_sheet(wb, aprovacoesSheet, "Aprovações");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const parts = Array.from(sp.keys());
  const suffix = parts.length > 0 ? "-filtrado" : "";
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="relatorio-compras${suffix}.xlsx"`,
    },
  });
}
