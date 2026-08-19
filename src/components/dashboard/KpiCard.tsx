"use client";

import { Sparkline, CHART_COLORS } from "./charts";
import type { ReactNode } from "react";

/**
 * Card de KPI executivo: ícone, valor, comparação com o período anterior,
 * tendência (seta + %), sparkline e cor inteligente (verde = favorável,
 * vermelho = desfavorável, seguindo `goodDirection`).
 *
 * Recebe o valor JÁ FORMATADO pelo servidor e o ícone JÁ RENDERIZADO
 * (elemento, não a referência do componente), já que funções não podem atravessar
 * a fronteira Server → Client Component do Next.js, mas elementos JSX podem.
 */
export function KpiCard({
  icon, label, formattedValue, deltaPct, direction, sparkline, goodDirection = "up", subtitle,
}: {
  icon: ReactNode;
  label: string;
  formattedValue: string;
  deltaPct: number | null;
  direction: "up" | "down" | "flat";
  sparkline?: number[];
  goodDirection?: "up" | "down";
  subtitle?: string;
}) {
  const isGood = direction === "flat" ? null : (direction === goodDirection);
  const deltaColor = isGood === null ? "var(--ink-muted)" : isGood ? CHART_COLORS.green : CHART_COLORS.red;
  const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "▬";

  return (
    <div className="kpi-cell">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: "var(--ink-soft)", display: "flex" }} aria-hidden>{icon}</span>
        {deltaPct !== null && (
          <span style={{ fontSize: 11.5, fontWeight: 700, color: deltaColor, display: "flex", alignItems: "center", gap: 3 }}>
            {arrow} {Math.abs(deltaPct).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="kpi-value">{formattedValue}</p>
      <p className="kpi-label">{label}</p>
      {subtitle && <p className="kpi-subtitle">{subtitle}</p>}
      {sparkline && sparkline.length > 1 && (
        <div style={{ marginTop: 6 }}>
          <Sparkline data={sparkline} color={isGood === false ? CHART_COLORS.red : CHART_COLORS.green} />
        </div>
      )}
    </div>
  );
}
