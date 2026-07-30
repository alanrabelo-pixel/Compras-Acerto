export type PipelineStage = { stage: string; label: string; count: number };

/**
 * Funil do pipeline — largura proporcional ao volume da etapa. Cada etapa
 * tem drill-through real para o Quadro já filtrado por aquela etapa (não é
 * só um enfeite visual).
 */
export function PipelineFunnel({ stages }: { stages: PipelineStage[] }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {stages.map((s) => {
        const pct = Math.max(6, (s.count / max) * 100);
        return (
          <a
            key={s.stage}
            href={`/solicitacoes?stage=${s.stage}`}
            style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}
          >
            <span style={{ fontSize: 11.5, color: "var(--ink-soft)", width: 168, flex: "none", textAlign: "right" }}>{s.label}</span>
            <div style={{ flex: 1, background: "var(--surface-muted)", borderRadius: 6, height: 20, position: "relative" }}>
              <div
                style={{
                  width: `${pct}%`, height: 20, borderRadius: 6,
                  background: s.count > 0 ? "linear-gradient(90deg, var(--info), var(--acerto-green))" : "var(--border-soft)",
                  transition: "width 0.3s",
                }}
              />
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, width: 26, flex: "none" }}>{s.count}</span>
          </a>
        );
      })}
    </div>
  );
}
