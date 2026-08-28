"use client";

import { useState } from "react";
import type { Alert } from "@/lib/dashboard-data";

type ProviderResult = {
  payload: { summary: string; highlights: string[] } | null;
  model: string | null;
  error: string | null;
};

/**
 * Item 2.9 do diagnóstico de IA: sob demanda, pede para a IA reordenar por
 * urgência real os MESMOS alertas já calculados por regra determinística
 * (ver AlertsPanel/AlertsPanelAgrupado) — não cria alerta nenhum, só oferece
 * uma leitura de prioridade que o painel plano (ordenado só por severidade)
 * não dá. Resultado descartável: não persiste, some ao recarregar a página,
 * porque o recorte muda a cada filtro do Dashboard.
 */
export function AlertsPriorityAssist({ alerts }: { alerts: Alert[] }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ anthropic: ProviderResult; gemini: ProviderResult } | null>(null);

  async function gerar() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboards/alerts-priority", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alerts: alerts.map((a) => ({ severity: a.severity, kind: a.kind, text: a.text })) }),
      });
      const data = await res.json();
      if (!res.ok && !data.anthropic) throw new Error(data.error ?? "Não foi possível priorizar os alertas.");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  if (alerts.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ fontSize: 11.5, padding: "6px 12px", justifySelf: "start" }}
        disabled={loading}
        onClick={gerar}
      >
        {loading ? "Priorizando..." : "Priorizar com IA (Claude + Gemini)"}
      </button>

      {error && <p style={{ fontSize: 12, color: "var(--danger)" }}>{error}</p>}

      {result && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <ProviderColumn label="Claude" r={result.anthropic} />
          <ProviderColumn label="Gemini" r={result.gemini} />
        </div>
      )}
    </div>
  );
}

function ProviderColumn({ label, r }: { label: string; r: ProviderResult }) {
  return (
    <div className="ai-provider-col">
      <p className="ai-provider-label">{label}</p>
      {!r.payload && r.error && <p style={{ color: "var(--danger)", fontSize: 10.5 }}>{r.error}</p>}
      {r.payload && (
        <>
          <p style={{ fontWeight: 600 }}>{r.payload.summary}</p>
          <ul style={{ margin: "4px 0 0 14px", padding: 0 }}>
            {r.payload.highlights.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
