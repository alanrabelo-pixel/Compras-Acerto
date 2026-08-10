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
import { TableWrap, TableHeadRow, TableRow } from "@/components/ui";
import {
  Wallet, FileText, Package, Hourglass, Truck, Banknote, TrendingUp, CheckCircle2, Users,
  Tags, Building2, Factory, Briefcase, Compass, FileSignature, Target, Timer, Ticket, Inbox,
  Calendar, Shield, Bell, type LucideIcon,
} from "lucide-react";

export const dynamic = "force-dynamic";

function Panel({ title, subtitle, icon, children }: { title: string; subtitle?: string; icon?: LucideIcon; children: React.ReactNode }) {
  const Icon = icon;
  return (
    <section className="card">
      <h2 className="dash-section-title">{Icon && <span aria-hidden style={{ display: "inline-flex" }}><Icon size={16} strokeWidth={1.75} /></span>}{title}</h2>
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
          <KpiCard icon={<Wallet size={18} strokeWidth={1.75} />} label="Valor Comprado" formattedValue={money(data.kpis.totalSpend.value)} deltaPct={data.kpis.totalSpend.deltaPct} direction={data.kpis.totalSpend.direction} />
          <KpiCard icon={<FileText size={18} strokeWidth={1.75} />} label="Solicitações" formattedValue={String(Math.round(data.kpis.requestCount.value))} deltaPct={data.kpis.requestCount.deltaPct} direction={data.kpis.requestCount.direction} />
          <KpiCard icon={<Package size={18} strokeWidth={1.75} />} label="Pedidos Emitidos" formattedValue={String(Math.round(data.kpis.poCount.value))} deltaPct={data.kpis.poCount.deltaPct} direction={data.kpis.poCount.direction} />
          <KpiCard icon={<Hourglass size={18} strokeWidth={1.75} />} label="Ciclo de Compra" formattedValue={`${data.kpis.avgCycleDays.value.toFixed(1)}d`} deltaPct={data.kpis.avgCycleDays.deltaPct} direction={data.kpis.avgCycleDays.direction} goodDirection="down" />
          <KpiCard
            icon={<Truck size={18} strokeWidth={1.75} />} label="Lead Time (PO → Entrega)"
            formattedValue={data.avgLeadTimeDays === null ? "—" : `${data.avgLeadTimeDays.toFixed(1)}d`}
            deltaPct={null} direction="flat" goodDirection="down"
          />
          <KpiCard icon={<Banknote size={18} strokeWidth={1.75} />} label="Saving Obtido" formattedValue={money(data.kpis.totalSaving.value)} deltaPct={data.kpis.totalSaving.deltaPct} direction={data.kpis.totalSaving.direction} />
          <KpiCard icon={<TrendingUp size={18} strokeWidth={1.75} />} label="Saving %" formattedValue={`${data.kpis.savingPct.value.toFixed(1)}%`} deltaPct={data.kpis.savingPct.deltaPct} direction={data.kpis.savingPct.direction} />
          <KpiCard
            icon={<CheckCircle2 size={18} strokeWidth={1.75} />} label="SLA Cumprido"
            formattedValue={data.current.slaCompliancePct === null ? "—" : `${data.current.slaCompliancePct.toFixed(0)}%`}
            deltaPct={data.kpis.slaCompliancePct.deltaPct} direction={data.kpis.slaCompliancePct.direction}
          />
          <KpiCard icon={<Users size={18} strokeWidth={1.75} />} label="Fornecedores Ativos" formattedValue={String(Math.round(data.kpis.activeSuppliers.value))} deltaPct={data.kpis.activeSuppliers.deltaPct} direction={data.kpis.activeSuppliers.direction} />
        </div>

        {/* ---- Evolução ---- */}
        <Panel title="Evolução das Compras e Saving" subtitle="Últimos 12 meses · valor negociado (Pedidos de Compra) e saving mensal">
          <TrendChart data={data.monthBuckets} />
        </Panel>

        {/* ---- Categoria / Centro de Custo ---- */}
        <div className="dash-grid-2">
          <Panel title="Compras por Categoria" icon={Tags} subtitle="Valor estimado do recorte atual (pipeline completo, não só o já emitido)">
            <CategoryDonut data={data.categoryBreakdown.map((c) => ({ label: CATEGORY_LABEL[c.key] ?? c.label, value: c.value }))} />
          </Panel>
          <Panel title="Compras por Centro de Custo" icon={Building2}>
            <CostCenterBarHorizontal data={data.costCenterBreakdown} />
          </Panel>
        </div>

        {/* ---- Fornecedores / Compradores / Pipeline ---- */}
        <div className="dash-grid-3">
          <Panel title="Top Fornecedores" icon={Factory}>
            <TopSuppliersTable rows={data.topSuppliers} />
          </Panel>
          <Panel title="Top Compradores" icon={Briefcase}>
            <BuyerRanking rows={data.buyerRanking} />
          </Panel>
          <Panel title="Pipeline de Compras" icon={Compass} subtitle="Clique numa etapa para ver as solicitações">
            <PipelineFunnel stages={data.pipeline} />
          </Panel>
        </div>

        {/* ---- Contratos / SLA / Ciclo ---- */}
        <div className="dash-grid-3">
          <Panel title="Contratos" icon={FileSignature}>
            <ContractsPanel data={data.contractsPanel} />
          </Panel>
          <Panel title="SLA" icon={Target}>
            <SlaGauge pct={data.current.slaCompliancePct} />
          </Panel>
          <Panel title="Tempo de Ciclo" icon={Timer} subtitle="Distribuição das solicitações concluídas, por faixa de dias">
            <CycleHistogram data={data.cycleHistogram} />
          </Panel>
        </div>

        {/* ---- Chamados (Viagens Acerto / Facilities / NDA) ---- */}
        <Panel
          title="Chamados (Viagens · Facilities · NDA)"
          icon={Ticket}
          subtitle="Fluxo simples fora do processo de Compras — mesmo período do filtro acima; demais filtros não se aplicam"
        >
          <div className="kpi-grid" style={{ marginBottom: 16 }}>
            <KpiCard
              icon={<Ticket size={18} strokeWidth={1.75} />} label="Chamados no período"
              formattedValue={String(data.ticketsPanel.total.value)}
              deltaPct={data.ticketsPanel.total.deltaPct} direction={data.ticketsPanel.total.direction}
            />
            <KpiCard
              icon={<Timer size={18} strokeWidth={1.75} />} label="Tempo médio de resolução"
              formattedValue={data.ticketsPanel.avgResolutionDays === null ? "—" : `${data.ticketsPanel.avgResolutionDays.toFixed(1)}d`}
              deltaPct={null} direction="flat" goodDirection="down"
            />
            <KpiCard icon={<Inbox size={18} strokeWidth={1.75} />} label="Chamados em aberto" formattedValue={String(data.ticketsPanel.openCount)} deltaPct={null} direction="flat" />
          </div>

          <TableWrap>
            <TableHeadRow columns="1.6fr 0.7fr 0.9fr 0.8fr 0.6fr">
              <span>Serviço</span>
              <span>Aberto</span>
              <span>Em andamento</span>
              <span>Concluído</span>
              <span>Total</span>
            </TableHeadRow>
            {data.ticketsPanel.byCategory.map((c) => (
              <TableRow key={c.slug} href={`/chamados/${c.slug}`} columns="1.6fr 0.7fr 0.9fr 0.8fr 0.6fr" style={{ alignItems: "center", fontSize: 12.5 }}>
                <span>{c.label}</span>
                <span>{c.open}</span>
                <span>{c.inProgress}</span>
                <span>{c.concluded}</span>
                <strong>{c.total}</strong>
              </TableRow>
            ))}
          </TableWrap>

          {data.ticketsPanel.oldestOpen.length > 0 && (
            <div style={{ marginTop: 14, borderTop: "1px solid var(--border-soft)", paddingTop: 12 }}>
              <p style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-soft)", marginBottom: 6 }}>Chamados abertos há mais tempo</p>
              <div style={{ display: "grid", gap: 4 }}>
                {data.ticketsPanel.oldestOpen.map((t) => (
                  <a key={t.id} href={t.href} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink)", textDecoration: "none" }}>
                    <span><strong>{t.code}</strong> · {t.categoryLabel} · {t.description}</span>
                    <span style={{ fontWeight: 700, color: "var(--ink-muted)" }}>{t.daysOpen}d aberto</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </Panel>

        {/* ---- Sazonalidade ---- */}
        <Panel title="Sazonalidade" icon={Calendar} subtitle="Quando as solicitações são abertas — ajuda a antecipar picos de demanda">
          <SeasonalityHeatmap matrix={data.heatmap} monthLabels={data.heatmapMonthLabels} weekdayLabels={data.weekdayLabels} max={data.heatmapMax} />
        </Panel>

        {/* ---- Mapa de riscos ---- */}
        <Panel title="Mapa de Riscos e Compliance" icon={Shield}>
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
        <Panel title="Alertas Inteligentes" icon={Bell}>
          <AlertsPanel alerts={data.alerts} />
        </Panel>
      </main>
    </AppShell>
  );
}
