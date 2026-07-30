import { money } from "@/lib/dashboard-data";

export type BuyerRow = { name: string; count: number; value: number; avgSaving: number | null; slaPct: number | null };

export function BuyerRanking({ rows }: { rows: BuyerRow[] }) {
  if (rows.length === 0) {
    return <p style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Nenhuma solicitação com comprador atribuído neste recorte.</p>;
  }
  return (
    <div style={{ display: "grid", gap: 2 }}>
      {rows.map((r, i) => (
        <div
          key={r.name}
          style={{
            display: "grid", gridTemplateColumns: "24px 1.6fr 1fr 0.8fr 0.8fr", alignItems: "center",
            gap: 8, padding: "9px 4px", borderBottom: i < rows.length - 1 ? "1px solid var(--border-soft)" : "none", fontSize: 12.5,
          }}
        >
          <span style={{ fontWeight: 700, color: "var(--ink-muted)" }}>{i + 1}º</span>
          <span style={{ fontWeight: 600 }}>{r.name}</span>
          <span className="text-soft">{money(r.value)}</span>
          <span className="text-soft">{r.count} sol.</span>
          <span style={{ fontWeight: 600, color: r.slaPct === null ? "var(--ink-muted)" : r.slaPct >= 80 ? "var(--acerto-green-dark)" : "var(--warning)" }}>
            {r.slaPct === null ? "—" : `${r.slaPct.toFixed(0)}% SLA`}
          </span>
        </div>
      ))}
    </div>
  );
}
