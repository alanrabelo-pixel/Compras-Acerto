/**
 * Serviço de dados do Dashboard executivo: toda a lógica de agregação
 * (Prisma) fica aqui, separada da renderização (ver src/app/dashboards/).
 * Reaproveitado também pelas exportações (Excel/PDF), para que o recorte
 * exportado seja sempre idêntico ao que está na tela.
 *
 * Filosofia: todo número mostrado no Dashboard vem de dado real do banco.
 * Quando um indicador pedido não tem dado de origem (ex: meta de saving,
 * orçamento por categoria, score de mercado de fornecedor), ou computamos a
 * partir de campos reais com uma fórmula transparente e documentada, ou
 * deixamos o indicador de fora. Nunca inventamos um número para preencher
 * espaço visual.
 */

import { prisma } from "@/lib/db";
import { STAGES } from "@/lib/workflow";
import { TICKET_CATEGORIES, TICKET_STATUS_LABEL, CATEGORY_ENUM_TO_SLUG, type TicketCategorySlug } from "@/lib/tickets";
import { CONTRACT_STATUS_LABEL, rotulo } from "@/lib/rotulos";
import { formatDateOnly } from "@/lib/format";
import type { Prisma, Stage } from "@prisma/client";

// ----------------------------------------------------------------------------
// Rótulos compartilhados
// ----------------------------------------------------------------------------

// Os rótulos vivem em src/lib/rotulos.ts. Reexportados aqui só para não
// quebrar quem já importava deste módulo. Eles estavam definidos neste arquivo
// e também copiados em solicitacoes/page.tsx, o que garantia divergência com o
// tempo, e o PRIORITY_LABEL daqui nunca chegou a ser usado em tela nenhuma.
export { PRIORITY_LABEL, DEMAND_TYPE_LABEL, STATUS_LABEL } from "@/lib/rotulos";

// ----------------------------------------------------------------------------
// Filtros (todos vêm da URL, ver DashboardFilters.tsx)
// ----------------------------------------------------------------------------

export type DashboardRawFilters = {
  diretoria?: string;
  costCenterId?: string;
  demandType?: string;
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
  if (f.stage) where.currentStage = f.stage as never;
  if (f.status) where.status = f.status;
  if (f.buyerId) where.buyerId = f.buyerId;
  // Fornecedor: só solicitações com Pedido de Compra já emitido para esse
  // fornecedor têm gasto realizado atribuível. É a mesma limitação de
  // qualquer relatório de "gasto por fornecedor" baseado em PO.
  if (f.supplierId) where.purchaseOrder = { supplierId: f.supplierId };
  return where;
}

function money(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
export { money };

// ----------------------------------------------------------------------------
// Alertas inteligentes
// ----------------------------------------------------------------------------

/**
 * Assunto do alerta. Cada disparo (mais abaixo, em loadDashboardData) já nasce
 * com o seu, e a ordem deste objeto é a ordem em que os grupos aparecem no
 * painel expandido: primeiro o que tem data marcada (contrato vencendo),
 * depois prazo, dinheiro e governança.
 *
 * Isto NÃO participa de nenhum cálculo e não muda quando um alerta dispara:
 * é só o rótulo do grupo.
 */
export const ALERT_KINDS = {
  contrato: "Contratos a vencer",
  sla: "Prazo e SLA",
  concentracao: "Concentração de fornecedor",
  saving: "Saving",
  avaliacao: "Avaliação de fornecedor",
  governanca: "Governança de contrato",
} as const;

export type AlertKind = keyof typeof ALERT_KINDS;

export type Alert = { severity: "danger" | "warning"; kind: AlertKind; text: string; href?: string };

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
// Núcleo de métricas: aplicado tanto ao período atual quanto ao anterior
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
    demandType: true, diretoria: true, buyerId: true,
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
    // O `include` do gestor é para o painel expandido de Contratos: sem ele a
    // tela só teria o contractManagerId. É um JOIN a mais nesta consulta que
    // já existia, não uma consulta nova, e não vira N+1 (nada é buscado por
    // linha depois).
    prisma.contract.findMany({
      where: { status: { not: "CANCELADO" } },
      include: { contractManager: { select: { name: true } } },
    }),
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

  // ---- Evolução mensal (independente do período de KPI; respeita os demais
  // filtros categóricos) ----
  //
  // A série é montada com 24 meses e o painel compacto continua usando só os
  // 12 últimos (`monthBuckets`, byte a byte a mesma série de antes: mesma
  // chave de mês, mesma soma). Os 24 existem para o painel expandido, onde
  // cabe o ano anterior inteiro ao lado do atual, que é o que permite ver se
  // o pico de dezembro se repete. Numa coluna estreita, 24 barras viram
  // traços, e por isso o compacto corta.
  //
  // Custo: continua UMA consulta, as mesmas três colunas, com o dobro do
  // intervalo de datas. Não acrescenta consulta por linha (o problema de N+1
  // apontado nos comentários deste arquivo); é a mesma varredura por
  // createdAt trazendo cerca de 2x linhas.
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const twentyFourMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 23, 1);
  const monthlyPOs = await prisma.purchaseOrder.findMany({
    where: { createdAt: { gte: twentyFourMonthsAgo }, request: baseWhere },
    select: { createdAt: true, initialValue: true, negotiatedValue: true },
  });
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = (d: Date) => d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
  // Rótulo por extenso ("Agosto 2025") para o eixo e a tabela do painel
  // expandido: "ago/25" é o que cabe em cima de uma barra estreita, não o que
  // alguém quer colar num relatório.
  const monthLabelLong = (d: Date) => {
    const mes = d.toLocaleDateString("pt-BR", { month: "long" });
    return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} ${d.getFullYear()}`;
  };
  const monthBuckets24: { key: string; label: string; labelLong: string; value: number; saving: number }[] = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthBuckets24.push({ key: monthKey(d), label: monthLabel(d), labelLong: monthLabelLong(d), value: 0, saving: 0 });
  }
  const bucketByKey = new Map(monthBuckets24.map((b) => [b.key, b]));
  for (const po of monthlyPOs) {
    const b = bucketByKey.get(monthKey(po.createdAt));
    if (!b) continue;
    b.value += Number(po.negotiatedValue);
    b.saving += Number(po.initialValue) - Number(po.negotiatedValue);
  }
  const monthBuckets = monthBuckets24.slice(-12);

  // ---- Compras por Centro de Custo ----
  const byCostCenter = new Map<string, { count: number; value: number }>();
  for (const r of currentRequests) {
    const key = r.costCenter.name;
    const cur = byCostCenter.get(key) ?? { count: 0, value: 0 };
    cur.count += 1;
    cur.value += Number(r.estimatedValue ?? 0);
    byCostCenter.set(key, cur);
  }
  const costCenterTotal = Array.from(byCostCenter.values()).reduce((s, v) => s + v.value, 0);
  const costCenterBreakdownFull = Array.from(byCostCenter.entries())
    .map(([label, v]) => ({ label, ...v, sharePct: costCenterTotal > 0 ? (v.value / costCenterTotal) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
  // O gráfico compacto corta em 10 barras (e a barra sozinha não diz o valor);
  // a versão expandida do painel usa a lista inteira, ver
  // CostCenterBreakdownList.tsx.
  const costCenterBreakdown = costCenterBreakdownFull.slice(0, 10);

  // ---- Lead time por solicitação (emissão do PO -> saída de "Aguardando
  // Entrega"): métrica real via StageEvent, não fabricada ----
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
  // avgSaving é ponderado pelo valor de cada compra (soma do R$ economizado
  // dividida pela soma do valor inicial), não uma média simples do % de cada
  // PO, senão uma PO pequena com desconto alto pesaria igual a uma PO grande,
  // distorcendo o número (pedido do usuário).
  type SupplierAgg = { name: string; cnpj: string; value: number; count: number; savingAmountSum: number; initialValueSum: number; leadTimeSum: number; leadTimeCount: number; riskTier?: string; approvedVendor?: boolean };
  const bySupplier = new Map<string, SupplierAgg>();
  for (const po of purchaseOrders) {
    const key = po.supplierId ?? po.supplierLegalName;
    const agg = bySupplier.get(key) ?? { name: po.supplierLegalName, cnpj: po.supplierCnpj, value: 0, count: 0, savingAmountSum: 0, initialValueSum: 0, leadTimeSum: 0, leadTimeCount: 0 };
    agg.value += Number(po.negotiatedValue);
    agg.count += 1;
    const initial = Number(po.initialValue);
    if (initial > 0) {
      agg.savingAmountSum += initial - Number(po.negotiatedValue);
      agg.initialValueSum += initial;
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
  const supplierRankingFull = Array.from(bySupplier.values())
    .map((s) => {
      const avgSaving = s.initialValueSum > 0 ? (s.savingAmountSum / s.initialValueSum) * 100 : 0;
      const avgLeadTime = s.leadTimeCount > 0 ? s.leadTimeSum / s.leadTimeCount : null;
      // Score de confiabilidade: fórmula transparente a partir de dados reais:
      // 40% risco cadastral (Supplier.riskTier), 20% homologação (approvedVendor),
      // 40% saving médio entregue (capado em 25% = nota máxima). NÃO é uma nota de
      // mercado/compliance externa, é só uma leitura interna e auditável.
      const riskScore = s.riskTier ? RISK_SCORE[s.riskTier] ?? 60 : 60;
      const vendorScore = s.approvedVendor ? 100 : 50;
      const savingScore = Math.min(100, Math.max(0, avgSaving * 4));
      const score = Math.round(riskScore * 0.4 + vendorScore * 0.2 + savingScore * 0.4);
      return {
        name: s.name, value: s.value, count: s.count, avgSaving, avgLeadTime, score,
        // Daqui para baixo: tudo já era calculado ou carregado acima e era
        // descartado no retorno, porque não cabia na coluna estreita do
        // painel. Só a versão expandida tem largura para mostrar.
        cnpj: s.cnpj,
        savingAmount: s.savingAmountSum,
        riskTier: s.riskTier ?? null,
        approvedVendor: s.approvedVendor ?? null,
        // Mesma razão do topSupplierConcentrationPct logo abaixo (gasto do
        // fornecedor sobre o gasto do período), aplicada linha a linha.
        sharePct: current.totalSpend > 0 ? (s.value / current.totalSpend) * 100 : 0,
      };
    })
    .sort((a, b) => b.value - a.value);
  // O painel compacto mostra os 10 primeiros; o expandido, o recorte inteiro.
  const topSuppliers = supplierRankingFull.slice(0, 10);
  const maxSupplierSpend = Math.max(1, ...topSuppliers.map((s) => s.value));
  const topSupplierConcentrationPct = current.totalSpend > 0 ? (maxSupplierSpend / current.totalSpend) * 100 : 0;

  // ---- Top Compradores ----
  // Mesmo critério de ponderação do saving por fornecedor acima: soma do R$
  // economizado dividida pela soma do valor inicial, não média simples de %.
  type BuyerAgg = { name: string; count: number; value: number; savingAmountSum: number; initialValueSum: number; concludedOnTime: number; concludedTotal: number };
  const byBuyer = new Map<string, BuyerAgg>();
  for (const r of currentRequests) {
    if (!r.buyer) continue;
    const agg = byBuyer.get(r.buyer.id) ?? { name: r.buyer.name, count: 0, value: 0, savingAmountSum: 0, initialValueSum: 0, concludedOnTime: 0, concludedTotal: 0 };
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
      agg.savingAmountSum += initial - Number(po.negotiatedValue);
      agg.initialValueSum += initial;
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
  const buyerValueTotal = Array.from(byBuyer.values()).reduce((s, b) => s + b.value, 0);
  const buyerRankingFull = Array.from(byBuyer.values())
    .map((b) => ({
      name: b.name,
      count: b.count,
      value: b.value,
      avgSaving: b.initialValueSum > 0 ? (b.savingAmountSum / b.initialValueSum) * 100 : null,
      slaPct: b.concludedTotal > 0 ? (b.concludedOnTime / b.concludedTotal) * 100 : null,
      // Idem fornecedores: já estava tudo agregado aqui e o painel estreito
      // não tinha onde mostrar. O saving em % sequer chegava à tela, apesar de
      // já viajar até o componente.
      savingAmount: b.savingAmountSum,
      concludedOnTime: b.concludedOnTime,
      concludedTotal: b.concludedTotal,
      sharePct: buyerValueTotal > 0 ? (b.value / buyerValueTotal) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
  const buyerRanking = buyerRankingFull.slice(0, 10);
  const buyerSlaValues = buyerRanking.map((b) => b.slaPct).filter((v): v is number => v !== null);
  const avgBuyerSla = buyerSlaValues.length > 0 ? buyerSlaValues.reduce((a, b) => a + b, 0) / buyerSlaValues.length : null;

  // ---- Pipeline por etapa ----
  // A contagem por etapa continua sendo a mesma de sempre. Junto dela vão o
  // valor estimado parado na etapa e quantas solicitações dali já estouraram o
  // SLA: os dois saem das solicitações que já estão em memória (nenhuma
  // consulta nova) e o funil compacto ignora ambos, porque numa coluna de 280px
  // não cabe mais do que rótulo, barra e contagem. Quem expande o painel é
  // quem vai atrás de onde está o dinheiro e onde está o atraso.
  const stageOrder = Object.keys(STAGES) as Stage[];
  const nowMsParaEtapas = now.getTime();
  const byStage = new Map<Stage, { count: number; value: number; overdueCount: number }>();
  for (const r of currentRequests) {
    const agg = byStage.get(r.currentStage) ?? { count: 0, value: 0, overdueCount: 0 };
    agg.count += 1;
    agg.value += Number(r.estimatedValue ?? 0);
    if (r.status === "ABERTO" && r.slaDeadline && r.slaDeadline.getTime() < nowMsParaEtapas) agg.overdueCount += 1;
    byStage.set(r.currentStage, agg);
  }
  const pipeline = stageOrder
    .filter((s) => s !== "CANCELADO")
    .map((s) => {
      const agg = byStage.get(s) ?? { count: 0, value: 0, overdueCount: 0 };
      return { stage: s, label: STAGES[s].label, count: agg.count, value: agg.value, overdueCount: agg.overdueCount };
    });

  // ---- Contratos ----
  const inNowMs = now.getTime();
  const contractsWithDays = contracts.map((c) => ({ ...c, daysToRenewal: Math.ceil((c.renewalDate.getTime() - inNowMs) / 86_400_000) }));
  const expiringContracts = contractsWithDays
    .filter((c) => c.daysToRenewal <= 60)
    .sort((a, b) => a.daysToRenewal - b.daysToRenewal);
  // Uma linha da lista de vencimentos com tudo que o contrato tem a dizer. O
  // painel compacto usa três desses campos (fornecedor, área, dias); o
  // expandido usa o resto, que já vinha do banco e era jogado fora aqui.
  const contractRows = expiringContracts.map((c) => ({
    id: c.id,
    supplierName: c.supplierName,
    tradeName: c.supplierTradeName,
    area: c.area,
    costCenter: c.costCenter,
    managerName: c.contractManager?.name ?? null,
    status: c.status,
    statusLabel: rotulo(CONTRACT_STATUS_LABEL, c.status),
    renewalDateLabel: formatDateOnly(c.renewalDate),
    endDateLabel: formatDateOnly(c.endDate),
    prazo: c.prazo,
    daysToRenewal: c.daysToRenewal,
  }));
  // Carteira por área: é o que os quatro números do topo do painel resumem sem
  // deixar ver. Sai dos contratos que já estavam carregados, sem consulta nova.
  const byContractArea = new Map<string, { area: string; total: number; ativos: number; emRenovacao: number; vencendo60d: number }>();
  for (const c of contractsWithDays) {
    const key = c.area || "Sem área";
    const agg = byContractArea.get(key) ?? { area: key, total: 0, ativos: 0, emRenovacao: 0, vencendo60d: 0 };
    agg.total += 1;
    if (c.status === "ATIVO") agg.ativos += 1;
    if (c.status === "RENOVACAO_EM_ANDAMENTO") agg.emRenovacao += 1;
    if (c.daysToRenewal <= 60) agg.vencendo60d += 1;
    byContractArea.set(key, agg);
  }
  const contractsPanel = {
    active: contracts.filter((c) => c.status === "ATIVO").length,
    renewing: contracts.filter((c) => c.status === "RENOVACAO_EM_ANDAMENTO").length,
    expiring60d: expiringContracts.length,
    critical30d: expiringContracts.filter((c) => c.daysToRenewal <= 30).length,
    list: contractRows.slice(0, 8),
    listaCompleta: contractRows,
    porArea: Array.from(byContractArea.values()).sort((a, b) => b.total - a.total),
    totalCarteira: contracts.length,
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

  // Faixas finas da MESMA distribuição, para o painel expandido. Cada faixa
  // larga acima é a soma exata de faixas daqui (0–5 = 0–2 + 3–5; 31+ = 31–45
  // + 46–60 + 61+, e assim por diante), então os dois desenhos nunca
  // discordam: o compacto agrupa, o expandido abre o mesmo agrupamento.
  // Mesmo critério de borda do histograma largo (`d <= max`) e mesma origem
  // (current.cycleDays, já em memória): nenhuma consulta nova.
  const cycleBucketFineDefs = [
    { label: "0–2", max: 2 },
    { label: "3–5", max: 5 },
    { label: "6–8", max: 8 },
    { label: "9–10", max: 10 },
    { label: "11–15", max: 15 },
    { label: "16–20", max: 20 },
    { label: "21–25", max: 25 },
    { label: "26–30", max: 30 },
    { label: "31–45", max: 45 },
    { label: "46–60", max: 60 },
    { label: "61+", max: Infinity },
  ];
  const cycleHistogramFine = cycleBucketFineDefs.map((b) => ({ label: b.label, count: 0 }));
  for (const d of current.cycleDays) {
    const idx = cycleBucketFineDefs.findIndex((b) => d <= b.max);
    cycleHistogramFine[idx === -1 ? cycleHistogramFine.length - 1 : idx].count += 1;
  }

  // ---- Sazonalidade (dia da semana x mês, últimos 12 meses) ----
  const WEEKDAY_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  // Nomes inteiros para o painel expandido, onde cabe a palavra toda. A
  // ordem é a mesma do WEEKDAY_LABEL (índice = Date.getDay()).
  const WEEKDAY_LABEL_LONG = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
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
  const heatmapMonthLabelsLong = monthBuckets.map((b) => b.labelLong);
  const heatmapMax = Math.max(1, ...heatmap.flat());

  // ---- Mapa de riscos ----
  // Cada número do mapa passou a nascer da LISTA que o gerou, e a contagem é o
  // `.length` dela. Antes cada cartão era um `.filter().length` solto; agora o
  // mesmo filtro serve os dois lados, então a contagem do painel compacto e a
  // lista do painel expandido não têm como divergir. Os critérios são os
  // mesmos de sempre, nenhum indicador mudou de conta.
  const noContractRequests = currentRequests.filter(
    (r) => r.needsContract === true && !r.contract && r.status !== "CANCELADO"
  );
  const emergencyRequests = currentRequests.filter((r) => r.priority === "CRITICA");
  const fragmentationRequests = currentRequests.filter((r) => r.fragmentationFlag);
  const pendingBudgetExceptions = budgetExceptions.filter((b) => b.decision === "PENDENTE");
  const personifiedApprovalList = approvals.filter((a) => a.personifiedBy);
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
      // O compacto mostra seis linhas com etapa e atraso; estes três campos
      // saem do mesmo registro e existem para a lista completa do expandido.
      buyerName: r.buyer?.name ?? null,
      costCenterName: r.costCenter.name,
      value: Number(r.estimatedValue ?? 0),
      daysLate: Math.ceil((now2 - r.slaDeadline!.getTime()) / 86_400_000),
    }))
    .sort((a, b) => b.daysLate - a.daysLate);

  const riskMap = {
    singleSupplierConcentrationPct: topSupplierConcentrationPct,
    topSupplierName: topSuppliers[0]?.name ?? null,
    emergencyCount: emergencyRequests.length,
    noContractCount: noContractRequests.length,
    overdueCount: overdue.length,
    criticalSuppliersCount: criticalSuppliers.size,
    fragmentationCount: fragmentationRequests.length,
    budgetExceptionsPending: pendingBudgetExceptions.length,
    personifiedApprovals: personifiedApprovalList.length,
  };

  // Quem são os envolvidos nas aprovações por personificação. É a única
  // consulta nova deste bloco e só acontece quando existe personificação no
  // recorte (o caso normal é zero), porque `Approval` guarda ids e um cartão
  // de compliance que diz "3 aprovações por personificação" sem dizer quem
  // aprovou e quem clicou não serve para auditar nada.
  const nomePorUsuarioId = new Map<string, string>();
  if (personifiedApprovalList.length > 0) {
    const idsEnvolvidos = Array.from(
      new Set(personifiedApprovalList.flatMap((a) => [a.approverId, a.personifiedBy!]))
    );
    const usuariosEnvolvidos = await prisma.user.findMany({
      where: { id: { in: idsEnvolvidos } },
      select: { id: true, name: true },
    });
    for (const u of usuariosEnvolvidos) nomePorUsuarioId.set(u.id, u.name);
  }

  // Fornecedores de risco Alto com o peso que têm no período: o cartão conta
  // fornecedores distintos, e aqui aparece quanto cada um levou.
  const criticalSupplierRows = Array.from(
    purchaseOrders
      .filter((po) => po.supplier?.riskTier === "ALTO")
      .reduce((acc, po) => {
        const agg = acc.get(po.supplierLegalName) ?? { name: po.supplierLegalName, poCount: 0, value: 0, approvedVendor: po.supplier?.approvedVendor ?? false };
        agg.poCount += 1;
        agg.value += Number(po.negotiatedValue);
        acc.set(po.supplierLegalName, agg);
        return acc;
      }, new Map<string, { name: string; poCount: number; value: number; approvedVendor: boolean }>())
      .values()
  ).sort((a, b) => b.value - a.value);

  const linhaDeRisco = (r: (typeof currentRequests)[number]) => ({
    id: r.id,
    code: r.code,
    shortDescription: r.shortDescription,
    stageLabel: STAGES[r.currentStage].label,
    costCenterName: r.costCenter.name,
    buyerName: r.buyer?.name ?? null,
    value: Number(r.estimatedValue ?? 0),
  });
  const porValorDesc = <T extends { value: number }>(a: T, b: T) => b.value - a.value;

  // O que está por trás de cada cartão do mapa. Nada aqui é recalculado: são
  // as mesmas listas que produziram as contagens acima, formatadas para tela.
  const riskDetails = {
    criticalSuppliers: criticalSupplierRows,
    emergency: emergencyRequests.map(linhaDeRisco).sort(porValorDesc),
    noContract: noContractRequests.map(linhaDeRisco).sort(porValorDesc),
    fragmentation: fragmentationRequests.map(linhaDeRisco).sort(porValorDesc),
    budgetExceptions: pendingBudgetExceptions
      .map((b) => {
        const req = requestById.get(b.requestId);
        return {
          id: b.id,
          requestId: b.requestId,
          code: req?.code ?? "-",
          shortDescription: req?.shortDescription ?? "",
          costCenterName: req?.costCenter.name ?? "-",
          level: b.level,
          justification: b.justification,
          value: Number(req?.estimatedValue ?? 0),
        };
      })
      .sort(porValorDesc),
    personified: personifiedApprovalList.map((a) => {
      const req = requestById.get(a.requestId);
      return {
        id: a.id,
        requestId: a.requestId,
        code: req?.code ?? "-",
        shortDescription: req?.shortDescription ?? "",
        level: a.level,
        approverName: nomePorUsuarioId.get(a.approverId) ?? "Aprovador não encontrado",
        personifierName: nomePorUsuarioId.get(a.personifiedBy!) ?? "Usuário não encontrado",
        justification: a.justification,
      };
    }),
  };

  // ---- Alertas inteligentes: só dispara com dado real ou limiar relativo
  // (nunca com meta inventada) ----
  // `kind` não muda nenhum disparo: é a etiqueta do assunto do alerta. Existe
  // porque a lista pode chegar a dezenas de linhas (uma por contrato vencendo,
  // uma por comprador fora da média) e, sem assunto, o painel expandido só
  // teria como oferecer a mesma pilha corrida, mais longa. Ver ALERT_KINDS.
  const alerts: Alert[] = [];
  for (const c of expiringContracts.filter((c) => c.daysToRenewal <= 10)) {
    alerts.push({ severity: "danger", kind: "contrato", text: `Contrato de ${c.supplierName} vence em ${c.daysToRenewal <= 0 ? "0 (vencido)" : c.daysToRenewal} dia(s)`, href: "/contratos" });
  }
  const savingTarget = process.env.DASHBOARD_SAVING_TARGET_PCT ? Number(process.env.DASHBOARD_SAVING_TARGET_PCT) : null;
  if (savingTarget !== null && current.savingPct < savingTarget) {
    alerts.push({ severity: "warning", kind: "saving", text: `Saving do período (${current.savingPct.toFixed(1)}%) está abaixo da meta configurada (${savingTarget}%)` });
  }
  if (avgBuyerSla !== null) {
    for (const b of buyerRanking) {
      if (b.slaPct !== null && b.slaPct < avgBuyerSla - 15) {
        alerts.push({ severity: "warning", kind: "sla", text: `${b.name} está com SLA (${b.slaPct.toFixed(0)}%) bem abaixo da média dos compradores (${avgBuyerSla.toFixed(0)}%)` });
      }
    }
  }
  const suppliersWithoutEvaluation = new Set(
    purchaseOrders.filter((po) => !evaluatedRequestIds.has(po.requestId)).map((po) => po.supplierLegalName)
  );
  if (suppliersWithoutEvaluation.size > 0) {
    alerts.push({ severity: "warning", kind: "avaliacao", text: `${suppliersWithoutEvaluation.size} fornecedor(es) com Pedido de Compra emitido mas sem avaliação (NPS) registrada` });
  }
  if (riskMap.singleSupplierConcentrationPct > 40 && riskMap.topSupplierName) {
    alerts.push({ severity: "danger", kind: "concentracao", text: `${riskMap.topSupplierName} concentra ${riskMap.singleSupplierConcentrationPct.toFixed(0)}% do gasto do período, sinal de dependência de fornecedor único` });
  }
  if (riskMap.noContractCount > 0) {
    alerts.push({ severity: "warning", kind: "governanca", text: `${riskMap.noContractCount} solicitação(ões) que precisam de contrato ainda não têm contrato mapeado` });
  }

  // ---- Chamados simples (Viagens Acerto / Facilities / NDA): fluxo à parte
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
  // não toca o registro do ticket (ver /api/tickets/[id]/messages), então é
  // uma medida confiável de "quando foi concluído" para o cálculo abaixo.
  const concludedTickets = currentTickets.filter((t) => t.status === "CONCLUIDO");
  const ticketResolutionDays = concludedTickets.map((t) => (t.updatedAt.getTime() - t.createdAt.getTime()) / 86_400_000);
  const avgTicketResolutionDays = ticketResolutionDays.length > 0
    ? ticketResolutionDays.reduce((a, b) => a + b, 0) / ticketResolutionDays.length
    : null;

  const openTickets = currentTickets.filter((t) => t.status !== "CONCLUIDO");
  const nowMs = now.getTime();
  // A fila inteira de chamados em aberto, do mais antigo para o mais novo.
  // `requesterName` e `statusLabel` já eram montados aqui e nunca chegavam à
  // tela: no rodapé estreito do painel não cabia nada além de código, serviço
  // e dias. São eles, mais a descrição sem o corte de 70 caracteres, que fazem
  // a diferença entre "há 12 chamados em aberto" e saber de quem são.
  const openTicketRows = openTickets
    .map((t) => {
      const slug = CATEGORY_ENUM_TO_SLUG[t.category];
      return {
        id: t.id,
        code: t.code,
        categorySlug: slug,
        categoryLabel: TICKET_CATEGORIES[slug].label,
        href: `/chamados/${slug}/${t.id}`,
        requesterName: t.requesterName,
        description: t.description.length > 70 ? `${t.description.slice(0, 70)}…` : t.description,
        descriptionLong: t.description.length > 240 ? `${t.description.slice(0, 240)}…` : t.description,
        status: t.status,
        statusLabel: TICKET_STATUS_LABEL[t.status] ?? t.status,
        daysOpen: Math.floor((nowMs - t.createdAt.getTime()) / 86_400_000),
      };
    })
    .sort((a, b) => b.daysOpen - a.daysOpen);

  const ticketsPanel = {
    total: trend(currentTickets.length, previousTicketsCount),
    byCategory: ticketsByCategory,
    avgResolutionDays: avgTicketResolutionDays,
    openCount: openTickets.length,
    // Mesma lista, dois cortes: o rodapé do painel compacto mostra seis linhas,
    // o expandido mostra a fila toda. Não há segunda consulta nem segundo
    // critério de ordenação.
    oldestOpen: openTicketRows.slice(0, 6),
    openAll: openTicketRows,
  };

  return {
    generatedAt: now,
    range: { de, ate, prevDe, prevAte },
    kpis,
    current,
    previous,
    avgLeadTimeDays,
    monthBuckets,
    // Série de 24 meses do painel expandido da Evolução. `monthBuckets` é a
    // fatia final desta mesma lista, não um segundo cálculo.
    monthBuckets24,
    costCenterBreakdown,
    topSuppliers,
    buyerRanking,
    // As três listas "…Full" são as mesmas de cima sem o corte de 10 linhas
    // (mesmos objetos, só outra fatia do array), para os painéis expandidos.
    // avgBuyerSla já era calculado para os alertas e agora também é exibido.
    costCenterBreakdownFull,
    supplierRankingFull,
    buyerRankingFull,
    avgBuyerSla,
    pipeline,
    contractsPanel,
    cycleHistogram,
    // Mesma distribuição do cycleHistogram, em faixas mais finas (painel
    // expandido). Cada faixa larga é a soma exata de faixas desta lista.
    cycleHistogramFine,
    heatmap,
    heatmapMonthLabels,
    heatmapMonthLabelsLong,
    heatmapMax,
    weekdayLabels: WEEKDAY_LABEL,
    weekdayLabelsLong: WEEKDAY_LABEL_LONG,
    riskMap,
    // As listas por trás de cada cartão do mapa de riscos (painel expandido).
    // Vêm dos mesmos filtros que produziram as contagens de `riskMap`.
    riskDetails,
    alerts,
    overdue,
    ticketsPanel,
    filterOptions: { costCenters, buyers, suppliers: supplierOptions },
  };
}
