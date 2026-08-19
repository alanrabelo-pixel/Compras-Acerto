import { CheckCircle2, AlertCircle, AlertTriangle } from "lucide-react";

export type Alert = { severity: "danger" | "warning"; text: string; href?: string };

/**
 * Alertas inteligentes: cada um dispara só com dado real (limiar relativo
 * ou fato concreto), nunca com uma meta inventada. Ver geração em
 * src/lib/dashboard-data.ts.
 */
export function AlertsPanel({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) {
    return (
      <p style={{ fontSize: 12.5, color: "var(--acerto-green-dark)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
        <CheckCircle2 size={15} strokeWidth={1.75} aria-hidden /> Nenhum alerta no momento: operação dentro dos parâmetros esperados neste recorte.
      </p>
    );
  }
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {alerts.map((a, i) => {
        const style: React.CSSProperties = {
          display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, padding: "9px 12px", borderRadius: 8,
          background: a.severity === "danger" ? "var(--danger-bg)" : "var(--warning-bg)",
          color: "var(--ink)", textDecoration: "none",
        };
        const content = (
          <>
            <span aria-hidden style={{ display: "flex", marginTop: 1 }}>
              {a.severity === "danger" ? <AlertCircle size={15} strokeWidth={1.75} /> : <AlertTriangle size={15} strokeWidth={1.75} />}
            </span>
            <span>{a.text}</span>
          </>
        );
        return a.href ? (
          <a key={i} href={a.href} style={style}>{content}</a>
        ) : (
          <div key={i} style={style}>{content}</div>
        );
      })}
    </div>
  );
}
