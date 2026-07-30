import { Fragment } from "react";

export function SeasonalityHeatmap({
  matrix, monthLabels, weekdayLabels, max,
}: {
  matrix: number[][]; // [weekday][monthColumn]
  monthLabels: string[];
  weekdayLabels: string[];
  max: number;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: `70px repeat(${monthLabels.length}, 1fr)`, gap: 3, minWidth: 560 }}>
        <span />
        {monthLabels.map((m, i) => (
          <span key={i} style={{ fontSize: 10, color: "var(--ink-muted)", textAlign: "center" }}>{m}</span>
        ))}
        {weekdayLabels.map((wd, r) => (
          <Fragment key={r}>
            <span style={{ fontSize: 11, color: "var(--ink-soft)", alignSelf: "center" }}>{wd}</span>
            {matrix[r].map((v, c) => {
              const intensity = max > 0 ? v / max : 0;
              return (
                <div
                  key={`${r}-${c}`}
                  title={`${wd} · ${monthLabels[c]}: ${v} solicitação(ões)`}
                  style={{
                    height: 22, borderRadius: 4,
                    background: v === 0 ? "var(--surface-muted)" : `rgba(37, 211, 102, ${0.15 + intensity * 0.75})`,
                  }}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
      <p style={{ fontSize: 10.5, color: "var(--ink-muted)", marginTop: 8 }}>Quantidade de solicitações abertas, por dia da semana e mês (últimos 12 meses).</p>
    </div>
  );
}
