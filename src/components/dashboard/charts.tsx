"use client";

/**
 * Componentes de gráfico (recharts) do Dashboard executivo. Isolados num só
 * arquivo "use client" para o resto do dashboard (painéis de tabela, riscos,
 * alertas) continuar como Server Components — só paga o custo de JS de
 * gráfico quem realmente precisa renderizar um gráfico.
 */

import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  Legend, RadialBarChart, RadialBar, PolarAngleAxis,
} from "recharts";

// Tokens (não hex cru) — para os gráficos reagirem ao dark mode como o resto
// do app. Navegadores modernos resolvem var() em atributos de apresentação
// SVG (fill/stroke), então isso funciona igual a passar a cor computada.
// Sem azul em nenhum gráfico — não é cor da paleta oficial da Acerto (ver
// acerto-docs) e é a cor de um concorrente direto. "graphite" (var(--info),
// grafite/neutro) substitui o que antes era um azul de "série neutra".
export const CHART_COLORS = {
  green: "var(--acerto-green)",
  greenDark: "var(--acerto-green-dark)",
  graphite: "var(--info)",
  orange: "var(--warning)",
  red: "var(--danger)",
  gray: "var(--ink-muted)",
};

function money(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

// ---------------------------------------------------------------------------
// Sparkline — mini gráfico dentro de um KpiCard
// ---------------------------------------------------------------------------
export function Sparkline({ data, color }: { data: number[]; color: string }) {
  const points = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={36}>
      <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#spark-${color.replace("#", "")})`} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Evolução das Compras — valor (área) + saving (barra) por mês, 12 meses
// ---------------------------------------------------------------------------
export function TrendChart({ data }: { data: { label: string; value: number; saving: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-soft)" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--ink-muted)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
        <YAxis
          yAxisId="value" tick={{ fontSize: 10.5, fill: "var(--ink-muted)" }} axisLine={false} tickLine={false}
          tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
        />
        <YAxis yAxisId="saving" orientation="right" tick={{ fontSize: 10.5, fill: "var(--ink-muted)" }} axisLine={false} tickLine={false} hide />
        <Tooltip
          formatter={(value, name) => [money(Number(value)), name === "value" ? "Valor comprado" : "Saving"]}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }}
        />
        <Legend
          formatter={(value) => (value === "value" ? "Valor comprado" : "Saving")}
          wrapperStyle={{ fontSize: 11.5 }}
        />
        <Bar yAxisId="value" dataKey="value" fill={CHART_COLORS.graphite} radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar yAxisId="saving" dataKey="saving" fill={CHART_COLORS.green} radius={[4, 4, 0, 0]} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Compras por Centro de Custo — barra horizontal
// ---------------------------------------------------------------------------
export function CostCenterBarHorizontal({ data }: { data: { label: string; value: number }[] }) {
  const height = Math.max(180, data.length * 32);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-soft)" />
        <XAxis type="number" tick={{ fontSize: 10.5, fill: "var(--ink-muted)" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
        <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 11.5, fill: "var(--ink-soft)" }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(value) => money(Number(value))} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }} />
        <Bar dataKey="value" fill={CHART_COLORS.green} radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// SLA — gauge (radial)
// ---------------------------------------------------------------------------
export function SlaGauge({ pct }: { pct: number | null }) {
  const value = pct ?? 0;
  const color = value >= 85 ? CHART_COLORS.green : value >= 60 ? CHART_COLORS.orange : CHART_COLORS.red;
  const data = [{ name: "sla", value, fill: color }];
  return (
    <div style={{ position: "relative", width: "100%", height: 180 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart data={data} innerRadius="70%" outerRadius="100%" startAngle={90} endAngle={-270} barSize={16}>
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar dataKey="value" cornerRadius={8} background={{ fill: "var(--surface-muted)" }} isAnimationActive={false} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 28, fontWeight: 700, color, letterSpacing: "-0.02em" }}>{pct === null ? "—" : `${value.toFixed(0)}%`}</span>
        <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>dentro do SLA</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tempo de Ciclo — histograma
// ---------------------------------------------------------------------------
export function CycleHistogram({ data }: { data: { label: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-soft)" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--ink-muted)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10.5, fill: "var(--ink-muted)" }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(value) => [`${Number(value)} solicitação(ões)`, "Quantidade"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }} />
        <Bar dataKey="count" fill={CHART_COLORS.green} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}
