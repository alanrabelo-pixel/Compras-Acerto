/**
 * Serviço de dados do Dashboard executivo — toda a lógica de agregação
 * (Prisma) fica aqui, separada da renderização (ver src/app/dashboards/).
 * Reaproveitado também pelas exportações (Excel/PDF), para que o recorte
 * exportado seja sempre idêntico ao que está na tela.
 *
 * Filosofia: todo número mostrado no Dashboard vem de dado real do banco.
 * Quando um indicador pedido não tem dado de origem (ex: meta de saving,
 * orçamento por categoria, score de mercado de fornecedor), ou computamos a
 * partir de campos reais com uma fórmula transparente e documentada, ou
 * deixamos o indicador de fora — nunca inventamos um número para preencher
 * espaço visual.
 */

import { prisma } from "@/lib/db";
import { STAGES } from "@/lib/workflow";
import { TICKET_CATEGORIES, TICKET_STATUS_LABEL, CATEGORY_ENUM_TO_SLUG, type TicketCategorySlug } from "@/lib/tickets";
import type { Prisma, Stage } from "@prisma/client";

// ----------------------------------------------------------------------------
// Rótulos compartilhados
// ----------------------------------------------------------------------------

export const PRIORITY_LABEL: Record<string, string> = { CRITICA: "Crítica", ALTA: "Alta", MEDIA: "Média", BAIXA: "Baixa" };

export const DEMAND_TYPE_LABEL: Record<string, string> = {
  COMPRA_PRODUTO: "Compra de Produtos",
  COMPRA_SERVICO: "Compra de Serviço",
  FERRAMENTA_NOVA: "Compra de Nova Ferramenta",
  FERRAMENTA_USUARIOS: "Ferramentas — Inclusão/remoção de usuários",
  FERRAMENTA_UPGRADE_DOWNGRADE: "Ferramentas — Upgrade/Downgrade",
  RENOVACAO_CONTRATO: "Renovação de Contrato",
  CANCELAMENTO: "Cancelamento de Contrato/Serviço/Ferramenta",
};

export const CATEGORY_LABEL: Record<string, string> = {
  TI: "TI",
  MARKETING: "Marketing",
  RH: "RH",
  FACILITIES: "Facilities",
  LOGISTICA: "Logística",
  INDUSTRIAL: "Industrial",
  SERVICOS_GERAIS: "Serviços Gerais",
  OUTROS: "Outros",
};

export const STATUS_LABEL: Record<string, string> = { ABERTO: "Aberto", CONCLUIDO: "Concluído", CANCELADO: "Cancelado" };

// ----------------------------------------------------------------------------
// Filtros (todos vêm da URL — ver DashboardFilters.tsx)
// ----------------------------------------------------------------------------

export type DashboardRawFilters = {
  diretoria?: string;
  costCenterId?: string;
  demandType?: string;
  category?: string;
  stage?: string;
  status?: string;
  buyerId?: string;
  supplierId?: string;
  de?: string;
  ate?: string;
};

export function buildDashboardWhere(f: DashboardRawFilters): Prisma.PurchaseRequestWhereInput {
  const where: Prisma.PurchaseRequestWhereInput = {};
  if (f.diretoria) where.diretoria = f.diretoria as never;
  if (f.costCenterId) where.costCenterId = f.costCenterId;
  if (f.demandType) where.demandType = f.demandType as never;
  if (f.category) where.category = f.category as never;
  if (f.stage) where.currentStage = f.stage as never;
  if (f.status) where.status = f.status;
  if (f.buyerId) where.buyerId = f.buyerId;
  // Fornecedor: só solicitações com Pedido de Compra já emitido para esse
  // fornecedor têm gasto realizado atribuível — é a mesma limitação de
  // qualquer relatório de "gasto por fornecedor" baseado em PO.
  if (f.supplierId) where.purchaseOrder = { supplierId: f.supplierId };
  return where;
}

function money(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
export { money };

// ----------------------------------------------------------------------------
// Tendência (atual vs período anterior de mesma duração)
// ----------------------------------------------------------------------------

export type Trend = { value: number; deltaPct: number | null; direction: "up" | "down" | "flat" };

function trend(current: number, previous: number): Trend {
  if (previous === 0) {
    if (current === 0) return { value: current, deltaPct: null, direction: "flat" };
    return { value: current, deltaPct: null, direction: "up" };
  }
  const deltaPct = ((current - previous) / previous) * 100;
  return {
    value: current,
    deltaPct,
    direction: Math.abs(deltaPct) < 0.5 ? "flat" : deltaPct > 0 ? "up" : "down",
  };
}

// ----------------------------------------------------------------------------
// Núcleo de métricas — aplicado tanto ao período atual quanto ao anterior
// ----------------------------------------------------------------------------

type RequestForMetrics = {
  id: string;
  estimatedValue: unknown;
  status: string;
  priority: string;
  currentStage: Stage;
  createdAt: Date;
  slaDeadline: Date | null;
  needsContract: boolean | null;
  fragmentationFlag: boolean;
};

async function computeCoreMetrics(requests: RequestForMetrics[]) {
  const requestIds = requests.map((r) => r.id);
  const requestById = new Map(requests.map((r) => [r.id, r]));

  const [purchaseOrders, concludedEvents, evaluations] = await Promise.all([
    prisma.purchaseOrder.findMany({ where: { requestId: { in: requestIds } } }),
    prisma.stageEvent.findMany({ where: { requestId: { in: requestIds }, toStage: "CONCLUIDO" } }),
    prisma.supplierEvaluation.findMany({ where: { requestId: { in: requestIds } } }),
  ]);

  const totalInitial = purchaseOrders.reduce((s, po) => s + Number(po.initialValue), 0);
  const totalNegotiated = purchaseOrders.reduce((s, po) => s + Number(po.negotiatedValue), 0);
  const totalSaving = totalInitial - totalNegotiated;
  const savingPct = totalInitial > 0 ? (totalSaving / totalInitial) * 100 : 0;

  const cycleDays = concludedEvents
    .map((e) => {
      const req = requestById.get(e.requestId);
      if (!req) return null;
      return (e.createdAt.getTime() - req.createdAt.getTime()) / 86_400_000;
    })
    .filter((d): d is number => d !== null);
  const avgCycleDays = cycleDays.length > 0 ? cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length : 0;

  const onTimeCount = concludedEvents.filter((e) => {
    const req = requestById.get(e.requestId);
    return req?.slaDeadline && e.createdAt.getTime() <= req.slaDeadline.getTime();
  }).length;
  const slaCompliancePct = concludedEvents.length > 0 ? (onTimeCount / concludedEvents.length) * 100 : null;

  const promoters = evaluations.filter((e) => (e.score ?? 0) >= 9).length;
  const detractors = evaluations.filter((e) => (e.score ?? 0) <= 6).length;
  const nps = evaluations.length > 0 ? ((promoters - detractors) / evaluations.length) * 100 : null;

  return {
    requestCount: requests.length,
    poCount: purchaseOrders.length,
    totalSpend: totalNegotiated,
    totalSaving,
    savingPct,
    avgCycleDays,
    cycleDays,
    slaCompliancePct,
    nps,
    concludedCount: concludedEvents.length,
  };
}

// ----------------------------------------------------------------------------
// Painel completo
// ----------------------------------------------------------------------------

export type KpiSet = Awaited<ReturnType<typeof computeCoreMetrics>>;

export type DashboardData = Awaited<ReturnType<typeof loadDashboardData>>;

export async function loadDashboardData(filters: DashboardRawFilters) {
  const now = new Date();
  const ate = filters.ate ? new Date(`${filters.ate}T23:59:59`) : now;
  const de = filters.de ? new Date(filters.de) : new Date(now.getTime() - 90 * 86_400_000);
  const rangeMs = Math.max(ate.getTime() - de.getTime(), 86_400_000);
  const prevAte = new Date(de.getTime() - 1);
  const prevDe = new Date(prevAte.getTime() - rangeMs);

  const baseWhere = buildDashboardWhere(filters);
  const requestSelect = {
    id: true, code: true, shortDescription: true, estimatedValue: true, status: true, priority: true, currentStage: true,
    createdAt: true, slaDeadline: true, needsContract: true, fragmentationFlag: true,
    demandType: true, category: true, diretoria: true, buyerId: true,
    costCenter: { select: { name: true } },
    requester: { select: { name: true } },
    buyer: { select: { id: true, name: true } },
    contract: { select: { id: true } },
  } satisfies Prisma.PurchaseRequestSelect;

  const [currentRequests, previousRequests, costCenters, buyers, supplierOptions] = await Promise.all([
    prisma.purchaseRequest.findMany({ where: { ...baseWhere, createdAt: { gte: de, lte: ate } }, select: requestSelect, orderBy: { createdAt: "desc" } }),
    prisma.purchaseRequest.findMany({ where: { ...baseWhere, createdAt: { gte: prevDe, lte: prevAte } }, select: requestSelect }),
    prisma.costCenter.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { roles: { some: { role: "COMPRADOR" } }, active: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { purchaseOrders: { some: {} } }, orderBy: { legalName: "asc" } }),
  ]);

  const [current, previous] = await Promise.all([
    computeCoreMetrics(currentRequests),
    computeCoreMetrics(previousRequests),
  ]);

  const requestIds = currentRequests.map((r) => r.id);
  const [purchaseOrders, contracts, allStageEvents, budgetExceptions, approvals, evaluations] = await Promise.all([
    prisma.purchaseOrder.findMany({ where: { requestId: { in: requestIds } }, include: { supplier: true } }),
    prisma.contract.findMany({ where: { status: { not: "CANCELADO" } } }),
    prisma.stageEvent.findMany({ where: { requestId: { in: requestIds } } }),
    prisma.budgetException.findMany({ where: { requestId: { in: requestIds } } }),
    prisma.approval.findMany({ where: { requestId: { in: requestIds } } }),
    prisma.supplierEvaluation.findMany({ where: { requestId: { in: requestIds } } }),
  ]);
  const evaluatedRequestIds = new Set(evaluations.map((e) => e.requestId));
  const requestById = new Map(currentRequests.map((r) => [r.id, r]));
  const poByRequestId = new Map(purchaseOrders.map((po) => [po.requestId, po]));

  // ---- KPIs (com tendência vs período anterior) ----
  const activeSuppliersThisPeriod = new Set(purchaseOrders.map((po) => po.supplierId ?? po.supplierLegalName)).size;
  const kpis = {
    totalSpend: trend(current.totalSpend, previous.totalSpend),
    requestCount: trend(current.requestCount, previous.requestCount),
    poCount: trend(current.poCount, previous.poCount),
    avgCycleDays: trend(current.avgCycleDays, previous.avgCycleDays),
    totalSaving: trend(current.totalSaving, previous.totalSaving),
    savingPct: trend(current.savingPct, previous.savingPct),
    slaCompliancePct: trend(current.slaCompliancePct ?? 0, previous.slaCompliancePct ?? 0),
    activeSuppliers: trend(activeSuppliersThisPeriod, 0),
  };

  // ---- Evolução mensal (últimos 12 meses, independente do período de KPI —
  // respeita os demais filtros categóricos) ----
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const monthlyPOs = await prisma.purchaseOrder.findMany({
    where: { createdAt: { gte: twelveMonthsAgo }, request: baseWhere },
    select: { createdAt: true, initialValue: true, negotiatedValue: true },
  });
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = (d: Date) => d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
  const monthBuckets: { key: string; label: string; value: number; saving: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthBuckets.push({ key: monthKey(d), label: monthLabel(d), value: 0, saving: 0 });
  }
  const bucketByKey = new Map(monthBuckets.map((b) => [b.key, b]));
  for (const po of monthlyPOs) {
    const b = bucketByKey.get(monthKey(po.createdAt));
    if (!b) continue;
    b.value += Number(po.negotiatedValue);
    b.saving += Number(po.initialValue) - Number(po.negotiatedValue);
  }

  // ---- Compras por Categoria (valor estimado — cobre o pipeline inteiro,
  // não só o que já virou Pedido de Compra) ----
  const byCategory = new Map<string, { count: number; value: number }>();
  for (const r of currentRequests) {
    const key = r.category ?? "OUTROS";
    const cur = byCategory.get(key) ?? { count: 0, value: 0 };
    cur.count += 1;
    cur.value += Number(r.estimatedValue ?? 0);
    byCategory.set(key, cur);
  }
  const categoryBreakdown = Array.from(byCategory.entries())
    .map(([key, v]) => ({ key, label: CATEGORY_LABEL[key] ?? key, ...v }))
    .sort((a, b) => b.value - a.value);
  const totalCategoryValue = categoryBreakdown.reduce((s, c) => s + c.value, 0);

  // ---- Compras por Centro de Custo ----
  const byCostCenter = new Map<string, { count: number; value: number }>();
  for (const r of currentRequests) {
    const key = r.costCenter.name;
    const cur = byCostCenter.get(key) ?? { count: 0, value: 0 };
    cur.count += 1;
    cur.value += Number(r.estimatedValue ?? 0);
    byCostCenter.set(key, cur);
  }
  const costCenterBreakdown = Array.from(byCostCenter.entries())
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // ---- Lead time por solicitação (emissão do PO -> saída de "Aguardando
  // Entrega") — métrica real via StageEvent, não fabricada ----
  const leadTimeExitEvents = allStageEvents.filter((e) => e.fromStage === "AGUARDANDO_ENTREGA");
  const leadTimeDaysByRequestId = new Map<string, number>();
  for (const e of leadTimeExitEvents) {
    const po = poByRequestId.get(e.requestId);
    if (!po) continue;
    leadTimeDaysByRequestId.set(e.requestId, (e.createdAt.getTime() - po.createdAt.getTime()) / 86_400_000);
  }
  const allLeadTimes = Array.from(leadTimeDaysByRequestId.values());
  const avgLeadTimeDays = allLeadTimes.length > 0 ? allLeadTimes.reduce((a, b) => a + b, 0) / allLeadTimes.length : null;

  // ---- Top Fornecedores ----
  type SupplierAgg = { name: string; value: number; count: number; savingSum: number; savingCount: number; leadTimeSum: number; leadTimeCount: number; riskTier?: string; approvedVendor?: boolean };
  const bySupplier = new Map<string, SupplierAgg>();
  for (const po of purchaseOrders) {
    const key = po.supplierId ?? po.supplierLegalName;
    const agg = bySupplier.get(key) ?? { name: po.supplierLegalName, value: 0, count: 0, savingSum: 0, savingCount: 0, leadTimeSum: 0, leadTimeCount: 0 };
    agg.value += Number(po.negotiatedValue);
    agg.count += 1;
    const initial = Number(po.initialValue);
    if (initial > 0) {
      agg.savingSum += ((initial - Number(po.negotiatedValue)) / initial) * 100;
      agg.savingCount += 1;
    }
    const lt = leadTimeDaysByRequestId.get(po.requestId);
    if (lt !== undefined) {
      agg.leadTimeSum += lt;
      agg.leadTimeCount += 1;
    }
    if (po.supplier) {
      agg.riskTier = po.supplier.riskTier;
      agg.approvedVendor = po.supplier.approvedVendor;
    }
    bySupplier.set(key, agg);
  }
  const RISK_SCORE: Record<string, number> = { BAIXO: 100, MEDIO: 60, ALTO: 20 };
  const topSuppliers = Array.from(bySupplier.values())
    .map((s) => {
      const avgSaving = s.savingCount > 0 ? s.savingSum / s.savingCount : 0;
      const avgLeadTime = s.leadTimeCount > 0 ? s.leadTimeSum / s.leadTimeCount : null;
      // Score de confiabilidade — fórmula transparente a partir de dados reais:
      // 40% risco cadastral (Supplier.riskTier), 20% homologação (approvedVendor),
      // 40% saving médio entregue (capado em 25% = nota máxima). NÃO é uma nota de
      // mercado/compliance externa — é só uma leitura interna e auditável.
      const riskScore = s.riskTier ? RISK_SCORE[s.riskTier] ?? 60 : 60;
      const vendorScore = s.approvedVendor ? 100 : 50;
      const savingScore = Math.min(100, Math.max(0, avgSaving * 4));
      const score = Math.round(riskScore * 0.4 + vendorScore * 0.2 + savingScore * 0.4);
      return { name: s.name, value: s.value, count: s.count, avgSaving, avgLeadTime, score };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  const maxSupplierSpend = Math.max(1, ...topSuppliers.map((s) => s.value));
  const topSupplierConcentrationPct = current.totalSpend > 0 ? (maxSupplierSpend / current.totalSpend) * 100 : 0;

  // ---- Top Compradores ----
  type BuyerAgg = { name: string; count: number; value: number; savingSum: number; savingCount: number; concludedOnTime: number; concludedTotal: number };
  const byBuyer = new Map<string, BuyerAgg>();
  for (const r of currentRequests) {
    if (!r.buyer) continue;
    const agg = byBuyer.get(r.buyer.id) ?? { name: r.buyer.name, count: 0, value: 0, savingSum: 0, savingCount: 0, concludedOnTime: 0, concludedTotal: 0 };
    agg.count += 1;
    agg.value += Number(r.estimatedValue ?? 0);
    byBuyer.set(r.buyer.id, agg);
  }
  for (const po of purchaseOrders) {
    const req = requestById.get(po.requestId);
    if (!req?.buyerId) continue;
    const agg = byBuyer.get(req.buyerId);
    if (!agg) continue;
    const initial = Number(po.initialValue);
    if (initial > 0) {
      agg.savingSum += ((initial - Number(po.negotiatedValue)) / initial) * 100;
      agg.savingCount += 1;
    }
  }
  for (const e of allStageEvents) {
    if (e.toStage !== "CONCLUIDO") continue;
    const req = requestById.get(e.requestId);
    if (!req?.buyerId) continue;
    const agg = byBuyer.get(req.buyerId);
    if (!agg) continue;
    agg.concludedTotal += 1;
    if (req.slaDeadline && e.createdAt.getTime() <= req.slaDeadline.getTime()) agg.concludedOnTime += 1;
  }
  const buyerRanking = Array.from(byBuyer.values())
    .map((b) => ({
      name: b.name,
      count: b.count,
      value: b.value,
      avgSaving: b.savingCount > 0 ? b.savingSum / b.savingCount : null,
      slaPct: b.concludedTotal > 0 ? (b.concludedOnTime / b.concludedTotal) * 100 : null,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  const buyerSlaValues = buyerRanking.map((b) => b.slaPct).filter((v): v is number => v !== null);
  const avgBuyerSla = buyerSlaValues.length > 0 ? buyerSlaValues.reduce((a, b) => a + b, 0) / buyerSlaValues.length : null;

  // ---- Pipeline por etapa ----
  const stageOrder = Object.keys(STAGES) as Stage[];
  const byStage = new Map<Stage, number>();
  for (const r of currentRequests) byStage.set(r.currentStage, (byStage.get(r.currentStage) ?? 0) + 1);
  const pipeline = stageOrder
    .filter((s) => s !== "CANCELADO")
    .map((s) => ({ stage: s, label: STAGES[s].label, count: byStage.get(s) ?? 0 }));

  // ---- Contratos ----
  const inNowMs = now.getTime();
  const expiringContracts = contracts
    .map((c) => ({ ...c, daysToRenewal: Math.ceil((c.renewalDate.getTime() - inNowMs) / 86_400_000) }))
    .filter((c) => c.daysToRenewal <= 60)
    .sort((a, b) => a.daysToRenewal - b.daysToRenewal);
  const contractsPanel = {
    active: contracts.filter((c) => c.status === "ATIVO").length,
    renewing: contracts.filter((c) => c.status === "RENOVACAO_EM_ANDAMENTO").length,
    expiring60d: expiringContracts.length,
    critical30d: expiringContracts.filter((c) => c.daysToRenewal <= 30).length,
    list: expiringContracts.slice(0, 8),
  };

  // ---- Tempo de ciclo (histograma) ----
  const cycleBucketDefs = [
    { label: "0–5 dias", max: 5 },
    { label: "6–10 dias", max: 10 },
    { label: "11–20 dias", max: 20 },
    { label: "21–30 dias", max: 30 },
    { label: "31+ dias", max: Infinity },
  ];
  const cycleHistogram = cycleBucketDefs.map((b) => ({ label: b.label, count: 0 }));
  for (const d of current.cycleDays) {
    const idx = cycleBucketDefs.findIndex((b) => d <= b.max);
    cycleHistogram[idx === -1 ? cycleHistogram.length - 1 : idx].count += 1;
  }

  // ---- Sazonalidade (dia da semana x mês, últimos 12 meses) ----
  const WEEKDAY_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const seasonalityRequests = await prisma.purchaseRequest.findMany({
    where: { ...baseWhere, createdAt: { gte: twelveMonthsAgo } },
    select: { createdAt: true },
  });
  const heatmap: number[][] = Array.from({ length: 7 }, () => Array(12).fill(0));
  for (const r of seasonalityRequests) {
    const wd = r.createdAt.getDay();
    const monthsAgo = (now.getFullYear() - r.createdAt.getFullYear()) * 12 + (now.getMonth() - r.createdAt.getMonth());
    const col = 11 - monthsAgo;
    if (col >= 0 && col < 12) heatmap[wd][col] += 1;
  }
  const heatmapMonthLabels = monthBuckets.map((b) => b.label);
  const heatmapMax = Math.max(1, ...heatmap.flat());

  // ---- Mapa de riscos ----
  const noContractCount = currentRequests.filter(
    (r) => r.needsContract === true && !r.contract && r.status !== "CANCELADO"
  ).length;
  const criticalSuppliers = new Set(
    purchaseOrders.filter((po) => po.supplier?.riskTier === "ALTO").map((po) => po.supplierLegalName)
  );
  const now2 = now.getTime();
  const overdue = currentRequests
    .filter((r) => r.status === "ABERTO" && r.slaDeadline && r.slaDeadline.getTime() < now2)
    .map((r) => ({
      code: r.code,
      shortDescription: r.shortDescription,
      id: r.id,
      stageLabel: STAGES[r.currentStage].label,
      daysLate: Math.ceil((now2 - r.slaDeadline!.getTime()) / 86_400_000),
    }))
    .sort((a, b) => b.daysLate - a.daysLate);

  const riskMap = {
    singleSupplierConcentrationPct: topSupplierConcentrationPct,
    topSupplierName: topSuppliers[0]?.name ?? null,
    topCategoryConcentrationPct: totalCategoryValue > 0 && categoryBreakdown[0] ? (categoryBreakdown[0].value / totalCategoryValue) * 100 : 0,
    topCategoryLabel: categoryBreakdown[0]?.label ?? null,
    emergencyCount: currentRequests.filter((r) => r.priority === "CRITICA").length,
    noContractCount,
    overdueCount: overdue.length,
    criticalSuppliersCount: criticalSuppliers.size,
    fragmentationCount: currentRequests.filter((r) => r.fragmentationFlag).length,
    budgetExceptionsPending: budgetExceptions.filter((b) => b.decision === "PENDENTE").length,
    personifiedApprovals: approvals.filter((a) => a.personifiedBy).length,
  };

  // ---- Alertas inteligentes — só dispara com dado real ou limiar relativo
  // (nunca com meta inventada) ----
  type Alert = { severity: "danger" | "warning"; text: string; href?: string };
  const alerts: Alert[] = [];
  for (const c of expiringContracts.filter((c) => c.daysToRenewal <= 10)) {
    alerts.push({ severity: "danger", text: `Contrato de ${c.supplierName} vence em ${c.daysToRenewal <= 0 ? "0 (vencido)" : c.daysToRenewal} dia(s)`, href: "/contratos" });
  }
  const savingTarget = process.env.DASHBOARD_SAVING_TARGET_PCT ? Number(process.env.DASHBOARD_SAVING_TARGET_PCT) : null;
  if (savingTarget !== null && current.savingPct < savingTarget) {
    alerts.push({ severity: "warning", text: `Saving do período (${current.savingPct.toFixed(1)}%) está abaixo da meta configurada (${savingTarget}%)` });
  }
  if (avgBuyerSla !== null) {
    for (const b of buyerRanking) {
      if (b.slaPct !== null && b.slaPct < avgBuyerSla - 15) {
        alerts.push({ severity: "warning", text: `${b.name} está com SLA (${b.slaPct.toFixed(0)}%) bem abaixo da média dos compradores (${avgBuyerSla.toFixed(0)}%)` });
      }
    }
  }
  const suppliersWithoutEvaluation = new Set(
    purchaseOrders.filter((po) => !evaluatedRequestIds.has(po.requestId)).map((po) => po.supplierLegalName)
  );
  if (suppliersWithoutEvaluation.size > 0) {
    alerts.push({ severity: "warning", text: `${suppliersWithoutEvaluation.size} fornecedor(es) com Pedido de Compra emitido mas sem avaliação (NPS) registrada` });
  }
  if (riskMap.singleSupplierConcentrationPct > 40 && riskMap.topSupplierName) {
    alerts.push({ severity: "danger", text: `${riskMap.topSupplierName} concentra ${riskMap.singleSupplierConcentrationPct.toFixed(0)}% do gasto do período — dependência de fornecedor único` });
  }
  if (riskMap.noContractCount > 0) {
    alerts.push({ severity: "warning", text: `${riskMap.noContractCount} solicitação(ões) que precisam de contrato ainda não têm contrato mapeado` });
  }

  // ---- Chamados simples (Viagens Acerto / Facilities / NDA) — fluxo à parte
  // do processo de Compras (SimpleTicket, sem alçada/etapas), mas o pedido é
  // que o Dashboard também mostre esse recorte. Só o filtro de período
  // (de/ate) se aplica aqui: os demais filtros do dashboard (diretoria,
  // centro de custo, categoria de gasto, comprador, fornecedor) pertencem ao
  // modelo de PurchaseRequest e não existem em SimpleTicket.
  const [currentTickets, previousTicketsCount] = await Promise.all([
    prisma.simpleTicket.findMany({
      where: { createdAt: { gte: de, lte: ate } },
      select: { id: true, code: true, category: true, status: true, createdAt: true, updatedAt: true, requesterName: true, description: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.simpleTicket.count({ where: { createdAt: { gte: prevDe, lte: prevAte } } }),
  ]);

  const ticketCategorySlugs = Object.keys(TICKET_CATEGORIES) as TicketCategorySlug[];
  const byTicketCategory = new Map<string, { open: number; inProgress: number; concluded: number }>();
  for (const slug of ticketCategorySlugs) byTicketCategory.set(TICKET_CATEGORIES[slug].enumValue, { open: 0, inProgress: 0, concluded: 0 });
  for (const t of currentTickets) {
    const agg = byTicketCategory.get(t.category);
    if (!agg) continue;
    if (t.status === "ABERTO") agg.open += 1;
    else if (t.status === "EM_ANDAMENTO") agg.inProgress += 1;
    else agg.concluded += 1;
  }
  const ticketsByCategory = ticketCategorySlugs.map((slug) => {
    const cfg = TICKET_CATEGORIES[slug];
    const agg = byTicketCategory.get(cfg.enumValue)!;
    return { slug, label: cfg.label, open: agg.open, inProgress: agg.inProgress, concluded: agg.concluded, total: agg.open + agg.inProgress + agg.concluded };
  });

  // updatedAt só muda quando o status do chamado é alterado (POST de mensagem
  // não toca o registro do ticket — ver /api/tickets/[id]/messages), então é
  // uma medida confiável de "quando foi concluído" para o cálculo abaixo.
  const concludedTickets = currentTickets.filter((t) => t.status === "CONCLUIDO");
  const ticketResolutionDays = concludedTickets.map((t) => (t.updatedAt.getTime() - t.createdAt.getTime()) / 86_400_000);
  const avgTicketResolutionDays = ticketResolutionDays.length > 0
    ? ticketResolutionDays.reduce((a, b) => a + b, 0) / ticketResolutionDays.length
    : null;

  const openTickets = currentTickets.filter((t) => t.status !== "CONCLUIDO");
  const nowMs = now.getTime();
  const oldestOpenTickets = openTickets
    .map((t) => {
      const slug = CATEGORY_ENUM_TO_SLUG[t.category];
      return {
        id: t.id,
        code: t.code,
        categoryLabel: TICKET_CATEGORIES[slug].label,
        href: `/chamados/${slug}/${t.id}`,
        requesterName: t.requesterName,
        description: t.description.length > 70 ? `${t.description.slice(0, 70)}…` : t.description,
        statusLabel: TICKET_STATUS_LABEL[t.status] ?? t.status,
        daysOpen: Math.floor((nowMs - t.createdAt.getTime()) / 86_400_000),
      };
    })
    .sort((a, b) => b.daysOpen - a.daysOpen)
    .slice(0, 6);

  const ticketsPanel = {
    total: trend(currentTickets.length, previousTicketsCount),
    byCategory: ticketsByCategory,
    avgResolutionDays: avgTicketResolutionDays,
    openCount: openTickets.length,
    oldestOpen: oldestOpenTickets,
  };

  return {
    generatedAt: now,
    range: { de, ate, prevDe, prevAte },
    kpis,
    current,
    previous,
    avgLeadTimeDays,
    monthBuckets,
    categoryBreakdown,
    costCenterBreakdown,
    topSuppliers,
    buyerRanking,
    pipeline,
    contractsPanel,
    cycleHistogram,
    heatmap,
    heatmapMonthLabels,
    heatmapMax,
    weekdayLabels: WEEKDAY_LABEL,
    riskMap,
    alerts,
    overdue,
    ticketsPanel,
    filterOptions: { costCenters, buyers, suppliers: supplierOptions },
  };
}
