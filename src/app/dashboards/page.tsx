import { AppShell } from "@/components/AppShell";
import { DashboardFilters } from "@/components/DashboardFilters";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { TrendChart, CostCenterBarHorizontal, SlaGauge, CycleHistogram } from "@/components/dashboard/charts";
import { TopSuppliersTable, TopSuppliersTableExpandida } from "@/components/dashboard/TopSuppliersTable";
import { BuyerRanking, BuyerRankingExpandido } from "@/components/dashboard/BuyerRanking";
import { CostCenterBreakdownList } from "@/components/dashboard/CostCenterBreakdownList";
import { PipelineFunnel, PipelineFunnelExpandido } from "@/components/dashboard/PipelineFunnel";
import { ContractsPanel, ContractsPanelExpandido } from "@/components/dashboard/ContractsPanel";
import { SeasonalityHeatmap, SeasonalityHeatmapExpandido } from "@/components/dashboard/SeasonalityHeatmap";
import { PainelExpansivel } from "@/components/dashboard/PainelExpansivel";
import { EvolucaoExpandida } from "@/components/dashboard/EvolucaoExpandida";
import { CicloExpandido } from "@/components/dashboard/CicloExpandido";
import { RiskMap, RiskMapExpandido } from "@/components/dashboard/RiskMap";
import { AlertsPanel, AlertsPanelAgrupado } from "@/components/dashboard/AlertsPanel";
import { ChamadosExpandido } from "@/components/dashboard/ChamadosExpandido";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { loadDashboardData, money } from "@/lib/dashboard-data";
import { STAGES, etapaVisivelNoQuadro } from "@/lib/workflow";
import { TableWrap, TableHeadRow, TableRow, Card } from "@/components/ui";
import {
  Wallet, FileText, Package, Hourglass, Truck, Banknote, TrendingUp, CheckCircle2, Users,
  Building2, Factory, Briefcase, Compass, FileSignature, Target, Timer, Ticket, Inbox,
  Calendar, Shield, Bell,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardsPage({
  searchParams,
}: {
  searchParams: {
    de?: string; ate?: string; diretoria?: string; costCenterId?: string; demandType?: string;
    category?: string; stage?: string; status?: string; buyerId?: string; supplierId?: string;
  };
}) {
  const data = await loadDashboardData(searchParams);
  const stageOptions = (Object.keys(STAGES) as (keyof typeof STAGES)[])
    .filter(etapaVisivelNoQuadro)
    .map((s) => ({ value: s, label: STAGES[s].label }));

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
            formattedValue={data.avgLeadTimeDays === null ? "-" : `${data.avgLeadTimeDays.toFixed(1)}d`}
            deltaPct={null} direction="flat" goodDirection="down"
          />
          <KpiCard icon={<Banknote size={18} strokeWidth={1.75} />} label="Saving Obtido" formattedValue={money(data.kpis.totalSaving.value)} deltaPct={data.kpis.totalSaving.deltaPct} direction={data.kpis.totalSaving.direction} />
          <KpiCard icon={<TrendingUp size={18} strokeWidth={1.75} />} label="Saving %" formattedValue={`${data.kpis.savingPct.value.toFixed(1)}%`} deltaPct={data.kpis.savingPct.deltaPct} direction={data.kpis.savingPct.direction} />
          <KpiCard
            icon={<CheckCircle2 size={18} strokeWidth={1.75} />} label="SLA Cumprido"
            formattedValue={data.current.slaCompliancePct === null ? "-" : `${data.current.slaCompliancePct.toFixed(0)}%`}
            deltaPct={data.kpis.slaCompliancePct.deltaPct} direction={data.kpis.slaCompliancePct.direction}
          />
          <KpiCard icon={<Users size={18} strokeWidth={1.75} />} label="Fornecedores Ativos" formattedValue={String(Math.round(data.kpis.activeSuppliers.value))} deltaPct={data.kpis.activeSuppliers.deltaPct} direction={data.kpis.activeSuppliers.direction} />
        </div>

        {/* ---- Evolução ---- */}
        {/* Compacto: 12 meses, sem rótulo de valor. Expandido: 24 meses, valor
            em cada barra e a tabela mês a mês (ver EvolucaoExpandida.tsx). */}
        <PainelExpansivel
          titulo="Evolução das Compras e Saving"
          compacto={
            <Card titleSize="lg" title="Evolução das Compras e Saving" subtitle="Últimos 12 meses · valor negociado (Pedidos de Compra) e saving mensal">
              <TrendChart data={data.monthBuckets} />
            </Card>
          }
          expandido={<EvolucaoExpandida rows={data.monthBuckets24} />}
        />

        {/* ---- Centro de Custo ---- */}
        {/* Compacto: 10 barras, nome truncado no eixo e valor só no tooltip.
            Expandido: todos os centros, nome inteiro, valor, quantidade de
            solicitações e participação ao lado da barra. */}
        <PainelExpansivel
          titulo="Compras por Centro de Custo"
          compacto={
            <Card titleSize="lg" title="Compras por Centro de Custo" icon={<Building2 size={16} strokeWidth={1.75} />} subtitle="Valor estimado do recorte atual (pipeline completo, não só o já emitido)">
              <CostCenterBarHorizontal data={data.costCenterBreakdown} />
            </Card>
          }
          expandido={
            <>
              <p className="dash-section-subtitle">Valor estimado do recorte atual (pipeline completo, não só o já emitido)</p>
              <CostCenterBreakdownList rows={data.costCenterBreakdownFull} />
            </>
          }
        />

        {/* ---- Fornecedores / Compradores / Pipeline ---- */}
        <div className="dash-grid-3">
          {/* Compacto: 10 primeiros, seis colunas com rolagem lateral.
              Expandido: o recorte inteiro, mais CNPJ, participação no gasto,
              economia em reais, risco cadastral e homologação. */}
          <PainelExpansivel
            titulo="Top Fornecedores"
            compacto={
              // height 100% porque agora quem é item do grid é o invólucro da
              // expansão, e sem isto os cartões da linha perdem a altura igual.
              <Card titleSize="lg" title="Top Fornecedores" icon={<Factory size={16} strokeWidth={1.75} />} style={{ height: "100%" }}>
                <TopSuppliersTable rows={data.topSuppliers} />
              </Card>
            }
            expandido={<TopSuppliersTableExpandida rows={data.supplierRankingFull} />}
          />
          {/* Compacto: 10 primeiros, sem cabeçalho e sem o saving, que já
              chegava ao componente e não tinha coluna. Expandido: todos, com
              cabeçalho, saving em % e em reais e as contagens do SLA. */}
          <PainelExpansivel
            titulo="Top Compradores"
            compacto={
              <Card titleSize="lg" title="Top Compradores" icon={<Briefcase size={16} strokeWidth={1.75} />} style={{ height: "100%" }}>
                <BuyerRanking rows={data.buyerRanking} />
              </Card>
            }
            expandido={<BuyerRankingExpandido rows={data.buyerRankingFull} slaMedia={data.avgBuyerSla} />}
          />
          {/* Compacto: rótulo, barra de volume e contagem. Expandido: as
              mesmas etapas com o valor estimado parado em cada uma, a
              participação no total e quantas ali já venceram o SLA. O link de
              cada etapa para o Quadro filtrado continua nos dois. */}
          <PainelExpansivel
            titulo="Pipeline de Compras"
            compacto={
              <Card titleSize="lg" title="Pipeline de Compras" icon={<Compass size={16} strokeWidth={1.75} />} subtitle="Clique numa etapa para ver as solicitações" style={{ height: "100%" }}>
                <PipelineFunnel stages={data.pipeline} />
              </Card>
            }
            expandido={<PipelineFunnelExpandido stages={data.pipeline} />}
          />
        </div>

        {/* ---- Contratos / SLA / Ciclo ---- */}
        <div className="dash-grid-3">
          {/* Compacto: os quatro números e oito vencimentos com três campos.
              Expandido: a lista inteira dos 60 dias com data, gestor, centro
              de custo e status, mais a carteira por área. */}
          <PainelExpansivel
            titulo="Contratos"
            compacto={
              <Card titleSize="lg" title="Contratos" icon={<FileSignature size={16} strokeWidth={1.75} />} style={{ height: "100%" }}>
                <ContractsPanel data={data.contractsPanel} />
              </Card>
            }
            expandido={<ContractsPanelExpandido data={data.contractsPanel} />}
          />
          {/* SLA é o único painel desta tela sem expansão, de propósito. Ele é
              um número só, e um número não tem detalhe escondido: em tela cheia
              seria o mesmo mostrador de 180px no meio de um vazio de 1400px.
              O que o gauge realmente cala é o denominador (78% de quantas
              concluídas?), e isso é assunto do painel compacto, não de um
              clique. As leituras vizinhas de SLA já têm painel próprio: por
              comprador em Top Compradores, os vencidos em Mapa de Riscos e,
              agora, por etapa no Pipeline expandido. */}
          <Card titleSize="lg" title="SLA" icon={<Target size={16} strokeWidth={1.75} />}>
            <SlaGauge pct={data.current.slaCompliancePct} />
          </Card>
          {/* Compacto: 5 faixas largas. Expandido: as mesmas solicitações em
              11 faixas, com a contagem por faixa (ver CicloExpandido.tsx).
              height 100% no Card: quem estica na linha do grid agora é o
              PainelExpansivel, e sem isso o cartão pararia antes da borda. */}
          <PainelExpansivel
            titulo="Tempo de Ciclo"
            compacto={
              <Card titleSize="lg" title="Tempo de Ciclo" icon={<Timer size={16} strokeWidth={1.75} />} subtitle="Distribuição das solicitações concluídas, por faixa de dias" style={{ height: "100%" }}>
                <CycleHistogram data={data.cycleHistogram} />
              </Card>
            }
            expandido={<CicloExpandido rows={data.cycleHistogramFine} />}
          />
        </div>

        {/* ---- Chamados (Viagens Acerto / Facilities / NDA) ---- */}
        {/* Compacto: contagem por serviço e os seis chamados em aberto há mais
            tempo. Expandido: a fila inteira, quebrada por serviço, com o
            solicitante e o status que já vinham do banco e não cabiam no
            rodapé (ver ChamadosExpandido.tsx). */}
        <PainelExpansivel
          titulo="Chamados (Viagens · Facilities · NDA)"
          compacto={
            <Card titleSize="lg"
              title="Chamados (Viagens · Facilities · NDA)"
              icon={<Ticket size={16} strokeWidth={1.75} />}
              subtitle="Fluxo simples fora do processo de Compras, no mesmo período do filtro acima; demais filtros não se aplicam"
            >
              <div className="kpi-grid" style={{ marginBottom: 16 }}>
                <KpiCard
                  icon={<Ticket size={18} strokeWidth={1.75} />} label="Chamados no período"
                  formattedValue={String(data.ticketsPanel.total.value)}
                  deltaPct={data.ticketsPanel.total.deltaPct} direction={data.ticketsPanel.total.direction}
                />
                <KpiCard
                  icon={<Timer size={18} strokeWidth={1.75} />} label="Tempo médio de resolução"
                  formattedValue={data.ticketsPanel.avgResolutionDays === null ? "-" : `${data.ticketsPanel.avgResolutionDays.toFixed(1)}d`}
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
                  {/* O corte é o mesmo de sempre (seis linhas), mas agora ele se
                      declara, como já fazia a lista de SLA vencido do mapa de
                      riscos: sem isso, "12 em aberto" no KPI e seis linhas logo
                      abaixo pareciam contradição. */}
                  {data.ticketsPanel.openCount > data.ticketsPanel.oldestOpen.length && (
                    <p style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 6 }}>
                      +{data.ticketsPanel.openCount - data.ticketsPanel.oldestOpen.length} chamado(s) em aberto não listados aqui.
                    </p>
                  )}
                </div>
              )}
            </Card>
          }
          expandido={
            <ChamadosExpandido
              categorias={data.ticketsPanel.byCategory}
              abertos={data.ticketsPanel.openAll}
              totalPeriodo={data.ticketsPanel.total.value}
              avgResolutionDays={data.ticketsPanel.avgResolutionDays}
            />
          }
        />

        {/* ---- Sazonalidade ---- */}
        {/* Compacto: células apertadas, contagem só no title. Expandido:
            célula grande com o número dentro, rótulos por extenso e as somas
            por dia da semana e por mês (ver SeasonalityHeatmap.tsx). */}
        <PainelExpansivel
          titulo="Sazonalidade"
          compacto={
            <Card titleSize="lg" title="Sazonalidade" icon={<Calendar size={16} strokeWidth={1.75} />} subtitle="Quando as solicitações são abertas, para ajudar a antecipar picos de demanda">
              <SeasonalityHeatmap matrix={data.heatmap} monthLabels={data.heatmapMonthLabels} weekdayLabels={data.weekdayLabels} max={data.heatmapMax} />
            </Card>
          }
          expandido={
            <SeasonalityHeatmapExpandido
              matrix={data.heatmap}
              monthLabels={data.heatmapMonthLabelsLong}
              weekdayLabels={data.weekdayLabelsLong}
              max={data.heatmapMax}
            />
          }
        />

        {/* ---- Mapa de riscos ---- */}
        {/* Compacto: oito contagens e seis pedidos vencidos. Expandido: a lista
            inteira por trás de cada contagem maior que zero, incluindo quem
            aprovou por personificação (ver RiskMap.tsx). */}
        <PainelExpansivel
          titulo="Mapa de Riscos e Compliance"
          compacto={
            <Card titleSize="lg" title="Mapa de Riscos e Compliance" icon={<Shield size={16} strokeWidth={1.75} />}>
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
            </Card>
          }
          expandido={<RiskMapExpandido data={data.riskMap} details={data.riskDetails} overdue={data.overdue} />}
        />

        {/* ---- Alertas inteligentes ---- */}
        {/* Compacto: os cinco mais graves, com a contagem do que ficou de fora.
            Expandido: todos, agrupados por assunto (ver AlertsPanel.tsx). */}
        <PainelExpansivel
          titulo="Alertas Inteligentes"
          compacto={
            <Card titleSize="lg" title="Alertas Inteligentes" icon={<Bell size={16} strokeWidth={1.75} />}>
              <AlertsPanel alerts={data.alerts} limite={5} />
            </Card>
          }
          expandido={<AlertsPanelAgrupado alerts={data.alerts} />}
        />
      </main>
    </AppShell>
  );
}
