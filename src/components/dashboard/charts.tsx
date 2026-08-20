"use client";

/**
 * Componentes de gráfico (recharts) do Dashboard executivo. Isolados num só
 * arquivo "use client" para o resto do dashboard (painéis de tabela, riscos,
 * alertas) continuar como Server Components. Só paga o custo de JS de
 * gráfico quem realmente precisa renderizar um gráfico.
 */

import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  Legend, RadialBarChart, RadialBar, PolarAngleAxis, LabelList,
} from "recharts";

// Tokens (não hex cru), para os gráficos reagirem ao dark mode como o resto
// do app. Navegadores modernos resolvem var() em atributos de apresentação
// SVG (fill/stroke), então isso funciona igual a passar a cor computada.
// Sem azul em nenhum gráfico: não é cor da paleta oficial da Acerto (ver
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
// Sparkline: mini gráfico dentro de um KpiCard
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
// Evolução das Compras: valor (área) + saving (barra) por mês, 12 meses
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

/**
 * Rótulo curto de dinheiro para caber em cima de uma barra: "1,2 mi",
 * "340 mil". Devolve string vazia no zero, que é como o LabelList "esconde"
 * um rótulo: numa série de 24 meses os meses sem compra empilhariam 24 zeros
 * na linha de base.
 */
function moneyCurto(v: number) {
  if (!v) return "";
  const abs = Math.abs(v);
  // O espaço antes da unidade é um NBSP ( ) de propósito: o <Text> do
  // recharts quebra o rótulo em linhas nos espaços comuns quando ele é mais
  // largo que a barra, e "137 mil" virava "137" em cima de "mil". O NBSP não
  // está na lista de espaços que ele quebra, então o rótulo fica numa linha.
  if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1_000) return `${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/**
 * Evolução em tela cheia: 24 meses (o dobro do compacto), rótulo de valor em
 * cima de cada barra, todos os meses no eixo (`interval={0}`, senão o recharts
 * esconde tick sim tick não) e o eixo do saving à direita visível, que no
 * compacto fica `hide` por falta de espaço. Sem o eixo direito, as duas séries
 * parecem estar na mesma escala e não estão.
 *
 * O rótulo fica só na barra de valor comprado: com duas barras por mês num
 * espaço de ~54px, dois rótulos por mês se sobrepõem. O número exato do saving
 * está na tabela abaixo do gráfico (ver EvolucaoExpandida.tsx).
 */
export function TrendChartExpandido({ data }: { data: { label: string; value: number; saving: number }[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: Math.max(560, data.length * 54) }}>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={data} margin={{ top: 24, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-soft)" />
            <XAxis
              dataKey="label" interval={0} tick={{ fontSize: 11, fill: "var(--ink-soft)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false}
              // "set. de 24" (o que o toLocaleDateString devolve, e o que o
              // compacto mostra em 12 barras) não cabe 24 vezes lado a lado:
              // os rótulos se encostam. Aqui vira "set/24", o mesmo mês em
              // metade da largura. Se o ICU devolver outro formato, o replace
              // não acha nada e o rótulo passa igual.
              tickFormatter={(v: string) => v.replace(". de ", "/").replace(" de ", "/")}
            />
            <YAxis
              yAxisId="value" tick={{ fontSize: 10.5, fill: "var(--ink-muted)" }} axisLine={false} tickLine={false}
              tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
            />
            <YAxis
              yAxisId="saving" orientation="right" tick={{ fontSize: 10.5, fill: CHART_COLORS.greenDark }} axisLine={false} tickLine={false}
              tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
            />
            <Tooltip
              formatter={(value, name) => [money(Number(value)), name === "value" ? "Valor comprado" : "Saving"]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }}
            />
            <Legend
              formatter={(value) => (value === "value" ? "Valor comprado (escala à esquerda)" : "Saving (escala à direita)")}
              wrapperStyle={{ fontSize: 11.5 }}
            />
            {/* isAnimationActive={false}: o recharts esconde o LabelList
                enquanto a barra está animando, e o painel expandido abre
                justamente para ler número. Um rótulo que aparece 1,5s depois
                da tela abrir é um rótulo que a pessoa não vê. */}
            <Bar yAxisId="value" dataKey="value" fill={CHART_COLORS.graphite} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false}>
              <LabelList dataKey="value" position="top" offset={6} fontSize={9.5} fill="var(--ink-soft)" formatter={(v) => moneyCurto(Number(v))} />
            </Bar>
            <Bar yAxisId="saving" dataKey="saving" fill={CHART_COLORS.green} radius={[4, 4, 0, 0]} maxBarSize={16} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compras por Centro de Custo: barra horizontal
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
// SLA: gauge (radial)
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
        <span style={{ fontSize: 28, fontWeight: 700, color, letterSpacing: "-0.02em" }}>{pct === null ? "-" : `${value.toFixed(0)}%`}</span>
        <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>dentro do SLA</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tempo de Ciclo: histograma
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

/**
 * Tempo de ciclo em tela cheia: as mesmas solicitações concluídas em faixas
 * mais finas (11 em vez de 5, ver cycleHistogramFine em dashboard-data.ts) e
 * com a quantidade escrita em cima de cada barra. As faixas finas encaixam
 * exatamente dentro das largas do painel compacto, então abrir o painel
 * detalha a mesma distribuição em vez de mostrar outra.
 *
 * O eixo X aqui é `interval={0}`: com 11 faixas o recharts começa a esconder
 * rótulo, e uma faixa sem rótulo é uma faixa que não dá para citar.
 */
export function CycleHistogramExpandido({ data }: { data: { label: string; count: number }[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: Math.max(480, data.length * 56) }}>
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={data} margin={{ top: 24, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-soft)" />
            <XAxis dataKey="label" interval={0} tick={{ fontSize: 11, fill: "var(--ink-soft)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10.5, fill: "var(--ink-muted)" }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(value) => [`${Number(value)} solicitação(ões)`, "Quantidade"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }} />
            {/* Sem animação, pelo mesmo motivo do gráfico de evolução: o
                recharts só mostra o LabelList depois que a barra para. */}
            <Bar dataKey="count" fill={CHART_COLORS.green} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>
              <LabelList dataKey="count" position="top" offset={6} fontSize={11} fontWeight={600} fill="var(--ink-soft)" formatter={(v) => (Number(v) === 0 ? "" : String(v))} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
