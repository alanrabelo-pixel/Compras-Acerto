import { AppShell } from "@/components/AppShell";
import { DashboardFilters } from "@/components/DashboardFilters";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { TrendChart, CategoryDonut, CostCenterBarHorizontal, SlaGauge, CycleHistogram } from "@/components/dashboard/charts";
import { TopSuppliersTable } from "@/components/dashboard/TopSuppliersTable";
import { BuyerRanking } from "@/components/dashboard/BuyerRanking";
import { PipelineFunnel } from "@/components/dashboard/PipelineFunnel";
import { ContractsPanel } from "@/components/dashboard/ContractsPanel";
import { SeasonalityHeatmap } from "@/components/dashboard/SeasonalityHeatmap";
import { RiskMap } from "@/components/dashboard/RiskMap";
import { AlertsPanel } from "@/components/dashboard/AlertsPanel";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { loadDashboardData, money, CATEGORY_LABEL } from "@/lib/dashboard-data";
import { STAGES } from "@/lib/workflow";

export const dynamic = "force-dynamic";

function Panel({ title, subtitle, icon, children }: { title: string; subtitle?: string; icon?: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <h2 className="dash-section-title">{icon && <span aria-hidden>{icon}</span>}{title}</h2>
      {subtitle && <p className="dash-section-subtitle">{subtitle}</p>}
      {children}
    </section>
  );
}

export default async function DashboardsPage({
  searchParams,
}: {
  searchParams: {
    de?: string; ate?: string; diretoria?: string; costCenterId?: string; demandType?: string;
    category?: string; stage?: string; status?: string; buyerId?: string; supplierId?: string;
  };
}) {
  const data = await loadDashboardData(searchParams);
  const stageOptions = Object.keys(STAGES)
    .filter((s) => s !== "CANCELADO")
    .map((s) => ({ value: s, label: STAGES[s as keyof typeof STAGES].label }));

  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value) sp.set(key, value);
  }
  const excelHref = `/api/dashboards/export?${sp.toString()}`;
  const pdfHref = `/api/dashboards/export-pdf?${sp.toString()}`;

  return (
    <AppShell active="/dashboards">
      <main className="page" style={{ paddingTop: 28, display: "grid", gap: 20 }}>
        <a href="/solicitacoes" className="back-link">← voltar ao quadro</a>

        <DashboardHeader generatedAtIso={data.generatedAt.toISOString()} excelHref={excelHref} pdfHref={pdfHref} />

        <DashboardFilters
          costCenters={data.filterOptions.costCenters}
          stages={stageOptions}
          buyers={data.filterOptions.buyers}
          suppliers={data.filterOptions.suppliers}
        />

        {/* ---- KPIs ---- */}
        <div className="kpi-grid">
          <KpiCard icon="💰" label="Valor Comprado" formattedValue={money(data.kpis.totalSpend.value)} deltaPct={data.kpis.totalSpend.deltaPct} direction={data.kpis.totalSpend.direction} />
          <KpiCard icon="📄" label="Solicitações" formattedValue={String(Math.round(data.kpis.requestCount.value))} deltaPct={data.kpis.requestCount.deltaPct} direction={data.kpis.requestCount.direction} />
          <KpiCard icon="📦" label="Pedidos Emitidos" formattedValue={String(Math.round(data.kpis.poCount.value))} deltaPct={data.kpis.poCount.deltaPct} direction={data.kpis.poCount.direction} />
          <KpiCard icon="⏳" label="Ciclo de Compra" formattedValue={`${data.kpis.avgCycleDays.value.toFixed(1)}d`} deltaPct={data.kpis.avgCycleDays.deltaPct} direction={data.kpis.avgCycleDays.direction} goodDirection="down" />
          <KpiCard
            icon="🚀" label="Lead Time (PO → Entrega)"
            formattedValue={data.avgLeadTimeDays === null ? "—" : `${data.avgLeadTimeDays.toFixed(1)}d`}
            deltaPct={null} direction="flat" goodDirection="down"
          />
          <KpiCard icon="💵" label="Saving Obtido" formattedValue={money(data.kpis.totalSaving.value)} deltaPct={data.kpis.totalSaving.deltaPct} direction={data.kpis.totalSaving.direction} />
          <KpiCard icon="📈" label="Saving %" formattedValue={`${data.kpis.savingPct.value.toFixed(1)}%`} deltaPct={data.kpis.savingPct.deltaPct} direction={data.kpis.savingPct.direction} />
          <KpiCard
            icon="✔" label="SLA Cumprido"
            formattedValue={data.current.slaCompliancePct === null ? "—" : `${data.current.slaCompliancePct.toFixed(0)}%`}
            deltaPct={data.kpis.slaCompliancePct.deltaPct} direction={data.kpis.slaCompliancePct.direction}
          />
          <KpiCard icon="👥" label="Fornecedores Ativos" formattedValue={String(Math.round(data.kpis.activeSuppliers.value))} deltaPct={data.kpis.activeSuppliers.deltaPct} direction={data.kpis.activeSuppliers.direction} />
        </div>

        {/* ---- Evolução ---- */}
        <Panel title="Evolução das Compras e Saving" subtitle="Últimos 12 meses · valor negociado (Pedidos de Compra) e saving mensal">
          <TrendChart data={data.monthBuckets} />
        </Panel>

        {/* ---- Categoria / Centro de Custo ---- */}
        <div className="dash-grid-2">
          <Panel title="Compras por Categoria" icon="🗂" subtitle="Valor estimado do recorte atual (pipeline completo, não só o já emitido)">
            <CategoryDonut data={data.categoryBreakdown.map((c) => ({ label: CATEGORY_LABEL[c.key] ?? c.label, value: c.value }))} />
          </Panel>
          <Panel title="Compras por Centro de Custo" icon="🏢">
            <CostCenterBarHorizontal data={data.costCenterBreakdown} />
          </Panel>
        </div>

        {/* ---- Fornecedores / Compradores / Pipeline ---- */}
        <div className="dash-grid-3">
          <Panel title="Top Fornecedores" icon="🏭">
            <TopSuppliersTable rows={data.topSuppliers} />
          </Panel>
          <Panel title="Top Compradores" icon="🧑‍💼">
            <BuyerRanking rows={data.buyerRanking} />
          </Panel>
          <Panel title="Pipeline de Compras" icon="🧭" subtitle="Clique numa etapa para ver as solicitações">
            <PipelineFunnel stages={data.pipeline} />
          </Panel>
        </div>

        {/* ---- Contratos / SLA / Ciclo ---- */}
        <div className="dash-grid-3">
          <Panel title="Contratos" icon="📑">
            <ContractsPanel data={data.contractsPanel} />
          </Panel>
          <Panel title="SLA" icon="🎯">
            <SlaGauge pct={data.current.slaCompliancePct} />
          </Panel>
          <Panel title="Tempo de Ciclo" icon="⏱" subtitle="Distribuição das solicitações concluídas, por faixa de dias">
            <CycleHistogram data={data.cycleHistogram} />
          </Panel>
        </div>

        {/* ---- Sazonalidade ---- */}
        <Panel title="Sazonalidade" icon="📅" subtitle="Quando as solicitações são abertas — ajuda a antecipar picos de demanda">
          <SeasonalityHeatmap matrix={data.heatmap} monthLabels={data.heatmapMonthLabels} weekdayLabels={data.weekdayLabels} max={data.heatmapMax} />
        </Panel>

        {/* ---- Mapa de riscos ---- */}
        <Panel title="Mapa de Riscos e Compliance" icon="🛡">
          <RiskMap data={data.riskMap} />
          {data.overdue.length > 0 && (
            <div style={{ marginTop: 14, borderTop: "1px solid var(--border-soft)", paddingTop: 12 }}>
              <p style={{ fontSize: 11.5, fontWeight: 700, color: "var(--danger)", marginBottom: 6 }}>Pedidos com SLA vencido</p>
              <div style={{ display: "grid", gap: 4 }}>
                {data.overdue.slice(0, 6).map((r) => (
                  <a key={r.id} href={`/solicitacoes/${r.id}`} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink)", textDecoration: "none" }}>
                    <span><strong>{r.code}</strong> · {r.shortDescription} · {r.stageLabel}</span>
                    <span style={{ fontWeight: 700, color: "var(--danger)" }}>{r.daysLate}d atrasada</span>
                  </a>
                ))}
                {data.overdue.length > 6 && <p style={{ fontSize: 11, color: "var(--ink-muted)" }}>+{data.overdue.length - 6} outro(s)</p>}
              </div>
            </div>
          )}
        </Panel>

        {/* ---- Alertas inteligentes ---- */}
        <Panel title="Alertas Inteligentes" icon="🔔">
          <AlertsPanel alerts={data.alerts} />
        </Panel>
      </main>
    </AppShell>
  );
}
