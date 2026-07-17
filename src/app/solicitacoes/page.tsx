import { prisma } from "@/lib/db";
import { STAGES } from "@/lib/workflow";
import type { Stage } from "@prisma/client";
import { TopNav } from "@/components/TopNav";

export const dynamic = "force-dynamic";

const PRIORITY_BADGE: Record<string, string> = {
  CRITICA: "badge-danger",
  ALTA: "badge-warning",
  MEDIA: "badge-info",
  BAIXA: "badge-neutral",
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default async function SolicitacoesPage() {
  const requests = await prisma.purchaseRequest.findMany({
    include: { requester: true, costCenter: true },
    orderBy: { createdAt: "desc" },
  });

  const byStage = new Map<Stage, typeof requests>();
  for (const r of requests) {
    const list = byStage.get(r.currentStage) ?? [];
    list.push(r);
    byStage.set(r.currentStage, list);
  }

  return (
    <>
      <TopNav active="/solicitacoes" />
      <main className="page" style={{ paddingTop: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <h1 className="page-title">Solicitações de Compra</h1>
            <p className="page-subtitle">{requests.length} solicitação(ões) no total</p>
          </div>
        </div>

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
      </main>
    </>
  );
}
