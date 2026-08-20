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

/**
 * Sazonalidade em tela cheia.
 *
 * O que mostra a mais que o compacto: a contagem escrita dentro de cada
 * célula (no compacto ela só existe no `title`, ou seja, só para quem passa o
 * mouse e espera), os rótulos por extenso ("Segunda-feira", "Agosto 2025") em
 * vez de "Seg" e "ago/25", e as somas de cada linha e de cada coluna, que
 * respondem "qual dia da semana concentra" e "qual mês concentra" sem exigir
 * somar célula a célula.
 *
 * Sobre a intensidade da cor: aqui ela vai até 0,45 de opacidade, e não até
 * 0,90 como no compacto. O motivo é contraste: com o número DENTRO da célula,
 * um verde forte deixa o texto ilegível no tema escuro (o número usa
 * var(--ink), que é claro lá). Com a faixa mais baixa, o número fica legível
 * nos dois temas e a cor volta a ser o que precisa ser quando o número está
 * escrito: um apoio de leitura, não o dado.
 *
 * Sem "use client": é grade de divs, não tem gráfico nem interação.
 */
export function SeasonalityHeatmapExpandido({
  matrix, monthLabels, weekdayLabels, max,
}: {
  matrix: number[][]; // [weekday][monthColumn]
  monthLabels: string[]; // rótulos por extenso, ex: "Agosto 2025"
  weekdayLabels: string[]; // rótulos por extenso, ex: "Segunda-feira"
  max: number;
}) {
  const totalPorLinha = matrix.map((linha) => linha.reduce((s, v) => s + v, 0));
  const totalPorColuna = monthLabels.map((_, c) => matrix.reduce((s, linha) => s + (linha[c] ?? 0), 0));
  const totalGeral = totalPorLinha.reduce((s, v) => s + v, 0);

  // Sem nenhuma solicitação nos 12 meses, o expandido seria uma grade de 84
  // zeros ocupando a tela inteira: mais espaço para dizer menos que o
  // compacto já diz.
  if (totalGeral === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--ink-muted)", maxWidth: 620, lineHeight: 1.6 }}>
        Nenhuma solicitação aberta nos últimos 12 meses dentro deste recorte, então não há
        sazonalidade para detalhar. Os filtros do topo do Dashboard (menos o de período, que
        não se aplica a este painel) valem aqui.
      </p>
    );
  }

  const colunas = `150px repeat(${monthLabels.length}, minmax(74px, 1fr)) 68px`;
  const larguraMinima = 150 + monthLabels.length * 74 + 68 + (monthLabels.length + 1) * 4;
  const celulaBase: React.CSSProperties = {
    height: 44, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 13, fontVariantNumeric: "tabular-nums",
  };
  const celulaTotal: React.CSSProperties = {
    ...celulaBase, background: "var(--surface-muted)", color: "var(--ink)", fontWeight: 700,
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <p className="dash-section-subtitle" style={{ margin: 0 }}>
        Quantidade de solicitações abertas por dia da semana e mês, nos últimos 12 meses.
        Total do período: {totalGeral} solicitação(ões).
      </p>

      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: colunas, gap: 4, minWidth: larguraMinima }}>
          <span />
          {monthLabels.map((m, i) => {
            // "Agosto 2025" em duas linhas: é o rótulo inteiro, e em pé ele
            // cabe em 74px sem virar "Ago…".
            const [mes, ano] = m.split(" ");
            return (
              <span key={i} style={{ fontSize: 11, color: "var(--ink-soft)", textAlign: "center", lineHeight: 1.3, alignSelf: "end", paddingBottom: 4 }}>
                {mes}
                <br />
                <span style={{ color: "var(--ink-muted)" }}>{ano}</span>
              </span>
            );
          })}
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-soft)", textAlign: "center", alignSelf: "end", paddingBottom: 4 }}>Total</span>

          {weekdayLabels.map((wd, r) => (
            <Fragment key={r}>
              <span style={{ fontSize: 12.5, color: "var(--ink-soft)", alignSelf: "center" }}>{wd}</span>
              {matrix[r].map((v, c) => {
                const intensity = max > 0 ? v / max : 0;
                return (
                  <div
                    key={`${r}-${c}`}
                    title={`${wd} · ${monthLabels[c]}: ${v} solicitação(ões)`}
                    style={{
                      ...celulaBase,
                      background: v === 0 ? "var(--surface-muted)" : `rgba(37, 211, 102, ${0.1 + intensity * 0.35})`,
                      color: v === 0 ? "var(--ink-muted)" : "var(--ink)",
                      fontWeight: v === 0 ? 400 : 600,
                      opacity: v === 0 ? 0.7 : 1,
                    }}
                  >
                    {v}
                  </div>
                );
              })}
              <div style={celulaTotal}>{totalPorLinha[r]}</div>
            </Fragment>
          ))}

          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)", alignSelf: "center" }}>Total</span>
          {totalPorColuna.map((t, c) => (
            <div key={`total-${c}`} style={celulaTotal}>{t}</div>
          ))}
          <div style={{ ...celulaTotal, background: "var(--border-soft)" }}>{totalGeral}</div>
        </div>
      </div>

      <p style={{ fontSize: 11, color: "var(--ink-muted)", margin: 0 }}>
        A coluna Total soma o dia da semana nos 12 meses; a linha Total soma o mês nos sete
        dias. O tom de verde acompanha a contagem da célula, do mês mais fraco ao mais forte.
      </p>
    </div>
  );
}
