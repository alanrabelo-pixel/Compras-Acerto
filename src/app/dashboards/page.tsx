import { prisma } from "@/lib/db";
import { TopNav } from "@/components/TopNav";

export const dynamic = "force-dynamic";

function Bar({ label, value, max, suffix }: { label: string; value: number; max: number; suffix?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-soft)", marginBottom: 5 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 600, color: "var(--ink)" }}>{value.toLocaleString("pt-BR")}{suffix ?? ""}</span>
      </div>
      <div style={{ background: "var(--surface-muted)", borderRadius: 6, height: 8 }}>
        <div style={{ background: "var(--acerto-green)", width: `${pct}%`, height: 8, borderRadius: 6, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <h2 className="card-title">{title}</h2>
      {children}
    </section>
  );
}

export default async function DashboardsPage() {
  const [requests, purchaseOrders, evaluations, stageEvents] = await Promise.all([
    prisma.purchaseRequest.findMany({ include: { costCenter: true } }),
    prisma.purchaseOrder.findMany(),
    prisma.supplierEvaluation.findMany(),
    prisma.stageEvent.findMany({ where: { toStage: "CONCLUIDO" } }),
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

  // Demandas por diretoria e por centro de custo
  const byDiretoria = new Map<string, number>();
  const byCostCenter = new Map<string, number>();
  for (const r of requests) {
    byDiretoria.set(r.diretoria, (byDiretoria.get(r.diretoria) ?? 0) + 1);
    byCostCenter.set(r.costCenter.name, (byCostCenter.get(r.costCenter.name) ?? 0) + 1);
  }
  const maxDiretoria = Math.max(1, ...byDiretoria.values());
  const maxCostCenter = Math.max(1, ...byCostCenter.values());

  const abertos = requests.filter((r) => r.status === "ABERTO").length;
  const concluidos = requests.filter((r) => r.status === "CONCLUIDO").length;
  const cancelados = requests.filter((r) => r.status === "CANCELADO").length;

  return (
    <>
      <TopNav active="/dashboards" />
      <main className="page" style={{ paddingTop: 28 }}>
        <a href="/solicitacoes" className="back-link">← voltar ao quadro</a>
        <h1 className="page-title" style={{ marginTop: 12 }}>Dashboards</h1>
        <p className="page-subtitle">Indicadores agregados do processo de compras</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginTop: 20 }}>
          {[
            { label: "Solicitações abertas", value: abertos },
            { label: "Concluídas", value: concluidos },
            { label: "Canceladas", value: cancelados },
            { label: "Total", value: requests.length },
          ].map((s) => (
            <div key={s.label} className="stat-card">
              <p className="stat-value">{s.value}</p>
              <p className="stat-label">{s.label}</p>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
          <Card title="Saving">
            <p style={{ fontSize: 26, fontWeight: 700, color: "var(--acerto-green-dark)", margin: "0 0 6px", letterSpacing: "-0.02em" }}>{savingPct.toFixed(1)}%</p>
            <p style={{ fontSize: 12.5, color: "var(--ink-muted)", lineHeight: 1.5 }}>
              R$ {totalSaving.toLocaleString("pt-BR")} economizados em {purchaseOrders.length} pedido(s) de compra
              (R$ {totalInitial.toLocaleString("pt-BR")} → R$ {totalNegotiated.toLocaleString("pt-BR")})
            </p>
          </Card>

          <Card title="Ciclo de Compra">
            <p style={{ fontSize: 26, fontWeight: 700, color: "var(--acerto-green-dark)", margin: "0 0 6px", letterSpacing: "-0.02em" }}>{avgCycleDays.toFixed(1)} dias</p>
            <p style={{ fontSize: 12.5, color: "var(--ink-muted)", lineHeight: 1.5 }}>Tempo médio da abertura até a conclusão, em {cycleDays.length} solicitação(ões) concluída(s)</p>
          </Card>

          <Card title="NPS (avaliação do processo)">
            <p style={{ fontSize: 26, fontWeight: 700, color: "var(--acerto-green-dark)", margin: "0 0 6px", letterSpacing: "-0.02em" }}>{nps === null ? "—" : nps.toFixed(0)}</p>
            <p style={{ fontSize: 12.5, color: "var(--ink-muted)", lineHeight: 1.5 }}>
              {evaluations.length} avaliação(ões) · {promoters} promotor(es) · {detractors} detrator(es)
            </p>
          </Card>

          <Card title="Demandas por Diretoria">
            {Array.from(byDiretoria.entries()).map(([label, value]) => (
              <Bar key={label} label={label} value={value} max={maxDiretoria} />
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
      </main>
    </>
  );
}
