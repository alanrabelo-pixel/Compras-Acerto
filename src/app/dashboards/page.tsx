import { prisma } from "@/lib/db";
import { TopNav } from "@/components/TopNav";
import { DashboardFilters } from "@/components/DashboardFilters";
import { STAGES } from "@/lib/workflow";
import type { Prisma, Stage, Diretoria, DemandType } from "@prisma/client";

export const dynamic = "force-dynamic";

function Bar({
  label, value, max, suffix, sublabel, displayValue,
}: { label: string; value: number; max: number; suffix?: string; sublabel?: string; displayValue?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-soft)", marginBottom: 5 }}>
        <span>{label}{sublabel && <span style={{ color: "var(--ink-muted)" }}> · {sublabel}</span>}</span>
        <span style={{ fontWeight: 600, color: "var(--ink)" }}>{displayValue ?? `${value.toLocaleString("pt-BR")}${suffix ?? ""}`}</span>
      </div>
      <div style={{ background: "var(--surface-muted)", borderRadius: 6, height: 8 }}>
        <div style={{ background: "var(--acerto-green)", width: `${pct}%`, height: 8, borderRadius: 6, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

function Card({ title, children, icon }: { title: string; children: React.ReactNode; icon?: string }) {
  return (
    <section className="card">
      <h2 className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
        {title}
      </h2>
      {children}
    </section>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="stat-card" style={{ borderTop: `3px solid ${accent}` }}>
      <p className="stat-value" style={{ color: accent }}>{value}</p>
      <p className="stat-label">{label}</p>
    </div>
  );
}

function money(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

const PRIORITY_LABEL: Record<string, string> = { CRITICA: "Crítica", ALTA: "Alta", MEDIA: "Média", BAIXA: "Baixa" };

// Rótulos idênticos aos usados em Nova Solicitação (ver NovaSolicitacaoForm.tsx).
const DEMAND_TYPE_LABEL: Record<string, string> = {
  COMPRA_PRODUTO: "Compra de Produtos",
  COMPRA_SERVICO: "Compra de Serviço",
  FERRAMENTA_NOVA: "Compra de Nova Ferramenta",
  FERRAMENTA_USUARIOS: "Ferramentas — Inclusão/remoção de usuários",
  FERRAMENTA_UPGRADE_DOWNGRADE: "Ferramentas — Upgrade/Downgrade",
  RENOVACAO_CONTRATO: "Renovação de Contrato",
  CANCELAMENTO: "Cancelamento de Contrato/Serviço/Ferramenta",
};

export default async function DashboardsPage({
  searchParams,
}: {
  searchParams: { de?: string; ate?: string; diretoria?: string; costCenterId?: string; demandType?: string; stage?: string };
}) {
  // Filtros vindos da URL (ver DashboardFilters) — escopam todos os
  // indicadores da tela, não só o funil. Datas filtram por createdAt.
  const where: Prisma.PurchaseRequestWhereInput = {};
  if (searchParams.diretoria) where.diretoria = searchParams.diretoria as Diretoria;
  if (searchParams.costCenterId) where.costCenterId = searchParams.costCenterId;
  if (searchParams.demandType) where.demandType = searchParams.demandType as DemandType;
  if (searchParams.stage) where.currentStage = searchParams.stage as Stage;
  if (searchParams.de || searchParams.ate) {
    where.createdAt = {
      ...(searchParams.de ? { gte: new Date(searchParams.de) } : {}),
      ...(searchParams.ate ? { lte: new Date(`${searchParams.ate}T23:59:59`) } : {}),
    };
  }

  const [requests, costCenters] = await Promise.all([
    prisma.purchaseRequest.findMany({ where, include: { costCenter: true } }),
    prisma.costCenter.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  const requestIds = requests.map((r) => r.id);

  const [purchaseOrders, evaluations, stageEvents, budgetExceptions, approvals, contracts] = await Promise.all([
    prisma.purchaseOrder.findMany({ where: { requestId: { in: requestIds } } }),
    prisma.supplierEvaluation.findMany({ where: { requestId: { in: requestIds } } }),
    prisma.stageEvent.findMany({ where: { toStage: "CONCLUIDO", requestId: { in: requestIds } } }),
    prisma.budgetException.findMany({ where: { requestId: { in: requestIds } } }),
    prisma.approval.findMany({ where: { requestId: { in: requestIds } } }),
    prisma.contract.findMany({ where: { status: { not: "CANCELADO" }, requestId: { in: requestIds } } }),
  ]);

  // Saving agregado (a partir dos Pedidos de Compra já gerados)
  const totalInitial = purchaseOrders.reduce((sum, po) => sum + Number(po.initialValue), 0);
  const totalNegotiated = purchaseOrders.reduce((sum, po) => sum + Number(po.negotiatedValue), 0);
  const totalSaving = totalInitial - totalNegotiated;
  const savingPct = totalInitial > 0 ? (totalSaving / totalInitial) * 100 : 0;

  // Ciclo de compra: média de dias entre createdAt e a transição para CONCLUIDO.
  const requestById = new Map(requests.map((r) => [r.id, r]));
  const cycleDays = stageEvents
    .map((e) => {
      const req = requestById.get(e.requestId);
      if (!req) return null;
      return (e.createdAt.getTime() - req.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    })
    .filter((d): d is number => d !== null);
  const avgCycleDays = cycleDays.length > 0 ? cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length : 0;

  // NPS: promotores (9-10) - detratores (0-6), % sobre respostas.
  const promoters = evaluations.filter((e) => (e.score ?? 0) >= 9).length;
  const detractors = evaluations.filter((e) => (e.score ?? 0) <= 6).length;
  const nps = evaluations.length > 0 ? ((promoters - detractors) / evaluations.length) * 100 : null;

  // Demandas por diretoria (contagem + valor estimado) e por centro de custo
  const byDiretoria = new Map<string, { count: number; value: number }>();
  const byCostCenter = new Map<string, number>();
  for (const r of requests) {
    const d = byDiretoria.get(r.diretoria) ?? { count: 0, value: 0 };
    d.count += 1;
    d.value += Number(r.estimatedValue ?? 0);
    byDiretoria.set(r.diretoria, d);
    byCostCenter.set(r.costCenter.name, (byCostCenter.get(r.costCenter.name) ?? 0) + 1);
  }
  const maxDiretoria = Math.max(1, ...Array.from(byDiretoria.values()).map((d) => d.count));
  const maxCostCenter = Math.max(1, ...byCostCenter.values());

  // Funil por etapa — quantas solicitações estão paradas em cada etapa agora.
  const byStage = new Map<Stage, number>();
  for (const r of requests) {
    byStage.set(r.currentStage, (byStage.get(r.currentStage) ?? 0) + 1);
  }
  const stageOrder = Object.keys(STAGES) as Stage[];
  const maxStage = Math.max(1, ...stageOrder.map((s) => byStage.get(s) ?? 0));

  // Alerta de SLA — solicitações ainda abertas com prazo já vencido.
  const now = Date.now();
  const overdue = requests
    .filter((r) => r.status === "ABERTO" && r.slaDeadline && r.slaDeadline.getTime() < now)
    .map((r) => ({ ...r, daysLate: Math.ceil((now - r.slaDeadline!.getTime()) / (1000 * 60 * 60 * 24)) }))
    .sort((a, b) => b.daysLate - a.daysLate);

  const abertos = requests.filter((r) => r.status === "ABERTO").length;
  const concluidos = requests.filter((r) => r.status === "CONCLUIDO").length;
  const cancelados = requests.filter((r) => r.status === "CANCELADO").length;

  // Gasto total efetivo (Pedidos de Compra já emitidos, valor negociado).
  const totalSpend = totalNegotiated;

  // Sinalizações de risco/compliance — já calculadas em outras etapas do
  // fluxo, só não apareciam em nenhuma tela consolidada até agora.
  const fragmentationCount = requests.filter((r) => r.fragmentationFlag).length;
  const budgetExceptionsPending = budgetExceptions.filter((b) => b.decision === "PENDENTE").length;
  const budgetExceptionsApproved = budgetExceptions.filter((b) => b.decision === "APROVADO").length;
  const budgetExceptionsRejected = budgetExceptions.filter((b) => b.decision === "REPROVADO").length;
  const personifiedApprovals = approvals.filter((a) => a.personifiedBy).length;

  // Contratos vencendo nos próximos 60 dias.
  const in60Days = now + 60 * 24 * 60 * 60 * 1000;
  const expiringContracts = contracts
    .filter((c) => c.renewalDate.getTime() <= in60Days)
    .map((c) => ({ ...c, daysToRenewal: Math.ceil((c.renewalDate.getTime() - now) / (1000 * 60 * 60 * 24)) }))
    .sort((a, b) => a.daysToRenewal - b.daysToRenewal);

  // Gasto por fornecedor (a partir dos Pedidos de Compra já emitidos).
  const bySupplier = new Map<string, number>();
  for (const po of purchaseOrders) {
    bySupplier.set(po.supplierLegalName, (bySupplier.get(po.supplierLegalName) ?? 0) + Number(po.negotiatedValue));
  }
  const topSuppliers = Array.from(bySupplier.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxSupplierSpend = Math.max(1, ...topSuppliers.map(([, v]) => v));

  // Mix por tipo de demanda e por prioridade.
  const byDemandType = new Map<string, number>();
  const byPriority = new Map<string, number>();
  for (const r of requests) {
    byDemandType.set(r.demandType, (byDemandType.get(r.demandType) ?? 0) + 1);
    byPriority.set(r.priority, (byPriority.get(r.priority) ?? 0) + 1);
  }
  const maxDemandType = Math.max(1, ...byDemandType.values());
  const maxPriority = Math.max(1, ...byPriority.values());
  const priorityOrder = ["CRITICA", "ALTA", "MEDIA", "BAIXA"];

  const stageOptions = stageOrder.map((s) => ({ value: s, label: STAGES[s].label }));

  return (
    <>
      <TopNav active="/dashboards" />
      <main className="page" style={{ paddingTop: 28 }}>
        <a href="/solicitacoes" className="back-link">← voltar ao quadro</a>
        <h1 className="page-title" style={{ marginTop: 12 }}>Dashboards</h1>
        <p className="page-subtitle">Indicadores agregados do processo de compras · {requests.length} solicitação(ões) no recorte atual</p>

        <DashboardFilters costCenters={costCenters} stages={stageOptions} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginTop: 20 }}>
          <StatCard label="Solicitações abertas" value={abertos} accent="var(--info)" />
          <StatCard label="Concluídas" value={concluidos} accent="var(--acerto-green-dark)" />
          <StatCard label="Canceladas" value={cancelados} accent="var(--danger)" />
          <StatCard label="Total" value={requests.length} accent="var(--ink-soft)" />
        </div>

        {overdue.length > 0 && (
          <div
            className="section-gap"
            style={{ background: "var(--warning-bg)", border: "1px solid #fbdba0", borderRadius: 10, padding: 14 }}
          >
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--warning)", margin: "0 0 8px" }}>
              ⚠ {overdue.length} solicitação(ões) fora do prazo (SLA vencido)
            </p>
            <div style={{ display: "grid", gap: 6 }}>
              {overdue.slice(0, 5).map((r) => (
                <a
                  key={r.id}
                  href={`/solicitacoes/${r.id}`}
                  style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink)", textDecoration: "none" }}
                >
                  <span><strong>{r.code}</strong> · {r.shortDescription} · {STAGES[r.currentStage].label}</span>
                  <span style={{ fontWeight: 700, color: "var(--warning)" }}>{r.daysLate}d atrasada</span>
                </a>
              ))}
              {overdue.length > 5 && (
                <p style={{ fontSize: 11.5, color: "var(--ink-muted)", margin: 0 }}>+{overdue.length - 5} outra(s) fora do prazo</p>
              )}
            </div>
          </div>
        )}

        {expiringContracts.length > 0 && (
          <div
            className="section-gap"
            style={{ background: "var(--info-bg)", border: "1px solid #b8d4f5", borderRadius: 10, padding: 14 }}
          >
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--info)", margin: "0 0 8px" }}>
              📄 {expiringContracts.length} contrato(s) vencendo nos próximos 60 dias
            </p>
            <div style={{ display: "grid", gap: 6 }}>
              {expiringContracts.slice(0, 5).map((c) => (
                <a
                  key={c.id}
                  href="/contratos"
                  style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink)", textDecoration: "none" }}
                >
                  <span><strong>{c.supplierName}</strong> · {c.area}</span>
                  <span style={{ fontWeight: 700, color: "var(--info)" }}>
                    {c.daysToRenewal <= 0 ? "vencido" : `${c.daysToRenewal}d para vencer`}
                  </span>
                </a>
              ))}
              {expiringContracts.length > 5 && (
                <p style={{ fontSize: 11.5, color: "var(--ink-muted)", margin: 0 }}>+{expiringContracts.length - 5} outro(s) vencendo</p>
              )}
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginTop: 16 }}>
          <Card title="Gasto Total" icon="🧾">
            <p style={{ fontSize: 26, fontWeight: 700, color: "var(--acerto-green-dark)", margin: "0 0 6px", letterSpacing: "-0.02em" }}>{money(totalSpend)}</p>
            <p style={{ fontSize: 12.5, color: "var(--ink-muted)", lineHeight: 1.5 }}>Valor negociado em {purchaseOrders.length} Pedido(s) de Compra emitido(s)</p>
          </Card>

          <Card title="Saving" icon="💰">
            <p style={{ fontSize: 26, fontWeight: 700, color: "var(--acerto-green-dark)", margin: "0 0 6px", letterSpacing: "-0.02em" }}>{savingPct.toFixed(1)}%</p>
            <p style={{ fontSize: 12.5, color: "var(--ink-muted)", lineHeight: 1.5 }}>
              {money(totalSaving)} economizados ({money(totalInitial)} → {money(totalNegotiated)})
            </p>
          </Card>

          <Card title="Ciclo de Compra" icon="⏱">
            <p style={{ fontSize: 26, fontWeight: 700, color: "var(--acerto-green-dark)", margin: "0 0 6px", letterSpacing: "-0.02em" }}>{avgCycleDays.toFixed(1)} dias</p>
            <p style={{ fontSize: 12.5, color: "var(--ink-muted)", lineHeight: 1.5 }}>Tempo médio da abertura até a conclusão, em {cycleDays.length} solicitação(ões)</p>
          </Card>

          <Card title="NPS" icon="⭐">
            <p style={{ fontSize: 26, fontWeight: 700, color: "var(--acerto-green-dark)", margin: "0 0 6px", letterSpacing: "-0.02em" }}>{nps === null ? "—" : nps.toFixed(0)}</p>
            <p style={{ fontSize: 12.5, color: "var(--ink-muted)", lineHeight: 1.5 }}>
              {evaluations.length} avaliação(ões) · {promoters} promotor(es) · {detractors} detrator(es)
            </p>
          </Card>
        </div>

        <div className="section-gap">
          <Card title="Sinalizações de Risco e Compliance" icon="🛡">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
              <div style={{ textAlign: "center" }}>
                <p className="stat-value" style={{ fontSize: 22, color: fragmentationCount > 0 ? "var(--danger)" : "var(--ink)" }}>{fragmentationCount}</p>
                <p className="stat-label">Risco de fracionamento</p>
              </div>
              <div style={{ textAlign: "center" }}>
                <p className="stat-value" style={{ fontSize: 22, color: budgetExceptionsPending > 0 ? "var(--warning)" : "var(--ink)" }}>{budgetExceptionsPending}</p>
                <p className="stat-label">Exceções orçamentárias pendentes</p>
              </div>
              <div style={{ textAlign: "center" }}>
                <p className="stat-value" style={{ fontSize: 22 }}>{budgetExceptionsApproved} / {budgetExceptionsRejected}</p>
                <p className="stat-label">Exceções aprovadas / reprovadas</p>
              </div>
              <div style={{ textAlign: "center" }}>
                <p className="stat-value" style={{ fontSize: 22 }}>{personifiedApprovals}</p>
                <p className="stat-label">Aprovações por personificação</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="section-gap">
          <Card title="Funil por Etapa" icon="📊">
            {stageOrder.map((stage) => (
              <Bar key={stage} label={STAGES[stage].label} value={byStage.get(stage) ?? 0} max={maxStage} />
            ))}
          </Card>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
          <Card title="Demandas por Diretoria">
            {Array.from(byDiretoria.entries()).map(([label, d]) => (
              <Bar key={label} label={label} value={d.count} max={maxDiretoria} sublabel={money(d.value)} />
            ))}
          </Card>

          <Card title="Demandas por Centro de Custo">
            {Array.from(byCostCenter.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([label, value]) => (
                <Bar key={label} label={label} value={value} max={maxCostCenter} />
              ))}
          </Card>
        </div>

        <div className="section-gap">
          <Card title="Gasto por Fornecedor" icon="🏭">
            {topSuppliers.length === 0 && <p style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Nenhum Pedido de Compra emitido neste recorte.</p>}
            {topSuppliers.map(([name, value]) => (
              <Bar key={name} label={name} value={value} max={maxSupplierSpend} displayValue={money(value)} />
            ))}
          </Card>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
          <Card title="Mix por Tipo de Demanda">
            {Array.from(byDemandType.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([type, value]) => (
                <Bar key={type} label={DEMAND_TYPE_LABEL[type] ?? type} value={value} max={maxDemandType} />
              ))}
          </Card>

          <Card title="Mix por Prioridade">
            {priorityOrder
              .filter((p) => byPriority.has(p))
              .map((p) => (
                <Bar key={p} label={PRIORITY_LABEL[p]} value={byPriority.get(p) ?? 0} max={maxPriority} />
              ))}
          </Card>
        </div>
      </main>
    </>
  );
}
