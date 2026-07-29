import { prisma } from "@/lib/db";
import { STAGES } from "@/lib/workflow";
import type { Prisma, Stage, Diretoria, DemandType, Priority } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { SearchFilterBar } from "@/components/SearchFilterBar";

export const dynamic = "force-dynamic";

const PRIORITY_BADGE: Record<string, string> = {
  CRITICA: "badge-danger",
  ALTA: "badge-warning",
  MEDIA: "badge-info",
  BAIXA: "badge-neutral",
};

const DEMAND_TYPE_LABEL: Record<string, string> = {
  COMPRA_PRODUTO: "Compra de Produtos",
  COMPRA_SERVICO: "Compra de Serviço",
  FERRAMENTA_NOVA: "Compra de Nova Ferramenta",
  FERRAMENTA_USUARIOS: "Ferramentas — Inclusão/remoção de usuários",
  FERRAMENTA_UPGRADE_DOWNGRADE: "Ferramentas — Upgrade/Downgrade",
  RENOVACAO_CONTRATO: "Renovação de Contrato",
  CANCELAMENTO: "Cancelamento de Contrato/Serviço/Ferramenta",
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default async function SolicitacoesPage({
  searchParams,
}: {
  searchParams: { q?: string; diretoria?: string; costCenterId?: string; priority?: string; demandType?: string; view?: string };
}) {
  const viewMode = searchParams.view === "lista" ? "lista" : "kanban";
  const viewHref = (view: string) => {
    const params = new URLSearchParams();
    if (searchParams.q) params.set("q", searchParams.q);
    if (searchParams.diretoria) params.set("diretoria", searchParams.diretoria);
    if (searchParams.costCenterId) params.set("costCenterId", searchParams.costCenterId);
    if (searchParams.priority) params.set("priority", searchParams.priority);
    if (searchParams.demandType) params.set("demandType", searchParams.demandType);
    params.set("view", view);
    return `?${params.toString()}`;
  };

  const where: Prisma.PurchaseRequestWhereInput = {};
  if (searchParams.diretoria) where.diretoria = searchParams.diretoria as Diretoria;
  if (searchParams.costCenterId) where.costCenterId = searchParams.costCenterId;
  if (searchParams.priority) where.priority = searchParams.priority as Priority;
  if (searchParams.demandType) where.demandType = searchParams.demandType as DemandType;
  if (searchParams.q) {
    where.OR = [
      { code: { contains: searchParams.q, mode: "insensitive" } },
      { shortDescription: { contains: searchParams.q, mode: "insensitive" } },
      { requester: { name: { contains: searchParams.q, mode: "insensitive" } } },
    ];
  }

  const [requests, costCenters] = await Promise.all([
    prisma.purchaseRequest.findMany({
      where,
      include: { requester: true, costCenter: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.costCenter.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  const byStage = new Map<Stage, typeof requests>();
  for (const r of requests) {
    const list = byStage.get(r.currentStage) ?? [];
    list.push(r);
    byStage.set(r.currentStage, list);
  }

  return (
    <AppShell active="/solicitacoes">
      <main className="page" style={{ paddingTop: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h1 className="page-title">Solicitações de Compra</h1>
            <p className="page-subtitle">{requests.length} solicitação(ões) no recorte atual</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="view-toggle">
              <a href={viewHref("kanban")} className={viewMode === "kanban" ? "active" : ""}>☰ Kanban</a>
              <a href={viewHref("lista")} className={viewMode === "lista" ? "active" : ""}>▤ Lista</a>
            </div>
            <a href="/solicitacoes/pendencias" className="btn btn-secondary">Minhas Pendências →</a>
          </div>
        </div>

        <SearchFilterBar
          searchPlaceholder="Código, descrição ou solicitante..."
          filters={[
            { key: "diretoria", label: "Diretoria", options: [{ value: "CORPORATIVO", label: "Corporativo" }, { value: "REVENUE", label: "Revenue" }, { value: "TECNOLOGIA", label: "Tecnologia" }] },
            { key: "costCenterId", label: "Centro de Custo", options: costCenters.map((c) => ({ value: c.id, label: c.name })) },
            { key: "priority", label: "Prioridade", options: [{ value: "CRITICA", label: "Crítica" }, { value: "ALTA", label: "Alta" }, { value: "MEDIA", label: "Média" }, { value: "BAIXA", label: "Baixa" }] },
            { key: "demandType", label: "Tipo de Demanda", options: Object.entries(DEMAND_TYPE_LABEL).map(([value, label]) => ({ value, label })) },
          ]}
        />

        {viewMode === "kanban" ? (
        <div style={{ display: "flex", gap: 14, overflowX: "auto", marginTop: 22, paddingBottom: 12 }}>
          {Object.values(STAGES)
            .filter((s) => s.stage !== "CANCELADO")
            .map((stageDef) => {
              const items = byStage.get(stageDef.stage) ?? [];
              return (
                <div key={stageDef.stage} style={{ minWidth: 268, flex: "0 0 268px", background: "var(--surface-muted)", borderRadius: 14, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 4px 10px" }}>
                    <h2 style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)", margin: 0 }}>{stageDef.label}</h2>
                    <span className="badge badge-neutral">{items.length}</span>
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {items.map((r) => (
                      <a
                        key={r.id}
                        href={`/solicitacoes/${r.id}`}
                        className="card"
                        style={{ padding: 12, textDecoration: "none", color: "inherit", display: "block" }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--acerto-green-dark)" }}>{r.code}</span>
                          <span className={`badge ${PRIORITY_BADGE[r.priority] ?? "badge-neutral"}`}>{r.priority}</span>
                        </div>
                        <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--ink)", lineHeight: 1.35 }}>{r.shortDescription}</p>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span
                            style={{
                              width: 18, height: 18, borderRadius: "50%", background: "var(--acerto-green-50)", color: "var(--acerto-green-dark)",
                              fontSize: 8.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flex: "none",
                            }}
                          >
                            {initials(r.requester.name)}
                          </span>
                          <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>{r.requester.name} · {r.costCenter.name}</span>
                        </div>
                      </a>
                    ))}
                    {items.length === 0 && (
                      <p style={{ fontSize: 11, color: "var(--ink-muted)", padding: "8px 4px" }}>Nenhuma solicitação aqui.</p>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
        ) : (
        <div className="table-wrap section-gap">
          <div className="table-head-row" style={{ gridTemplateColumns: "1fr 2.6fr 1.6fr 0.9fr 1.6fr" }}>
            <span>Código</span>
            <span>Descrição</span>
            <span>Etapa</span>
            <span>Prioridade</span>
            <span>Solicitante</span>
          </div>
          {requests.map((r) => (
            <a
              key={r.id}
              href={`/solicitacoes/${r.id}`}
              className="table-row"
              style={{ gridTemplateColumns: "1fr 2.6fr 1.6fr 0.9fr 1.6fr", alignItems: "center" }}
            >
              <span style={{ fontWeight: 700, color: "var(--acerto-green-dark)" }}>{r.code}</span>
              <span className="text-soft">{r.shortDescription}</span>
              <span><span className="badge badge-neutral">{STAGES[r.currentStage].label}</span></span>
              <span><span className={`badge ${PRIORITY_BADGE[r.priority] ?? "badge-neutral"}`}>{r.priority}</span></span>
              <span className="text-soft">{r.requester.name} · {r.costCenter.name}</span>
            </a>
          ))}
          {requests.length === 0 && (
            <p style={{ padding: 20, fontSize: 12.5, color: "var(--ink-muted)" }}>Nenhuma solicitação encontrada neste recorte.</p>
          )}
        </div>
        )}
      </main>
    </AppShell>
  );
}
