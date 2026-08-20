import { money } from "@/lib/dashboard-data";
import { TableWrap, TableHeadRow, TableRow } from "@/components/ui";

export type PipelineStage = { stage: string; label: string; count: number };

/** O que o funil compacto recebe e joga fora: ver PipelineFunnelExpandido. */
export type PipelineStageFull = PipelineStage & { value: number; overdueCount: number };

/**
 * Funil do pipeline: largura proporcional ao volume da etapa. Cada etapa
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

/**
 * O mesmo funil em tela cheia, com o que a coluna estreita não comportava.
 *
 * O compacto responde "quantas solicitações em cada etapa". Ele cala duas
 * coisas que estão no mesmo registro: QUANTO está parado ali e quantas
 * daquelas já estouraram o SLA. São perguntas diferentes e a resposta costuma
 * ser diferente também: a etapa com mais solicitações raramente é a etapa com
 * mais dinheiro, e é por isso que cada linha aqui tem duas barras, uma de
 * quantidade e outra de valor, na mesma escala relativa. Onde as duas barras
 * se descolam está a distorção que o funil compacto esconde.
 *
 * A etapa continua sendo um link para o Quadro filtrado, exatamente como no
 * compacto: é o principal uso do painel e não pode se perder na tela cheia.
 */
export function PipelineFunnelExpandido({ stages }: { stages: PipelineStageFull[] }) {
  const totalCount = stages.reduce((acc, s) => acc + s.count, 0);
  const totalValue = stages.reduce((acc, s) => acc + s.value, 0);
  const totalOverdue = stages.reduce((acc, s) => acc + s.overdueCount, 0);
  const maxCount = Math.max(1, ...stages.map((s) => s.count));
  const maxValue = Math.max(1, ...stages.map((s) => s.value));
  const colunas = "minmax(150px, 1.2fr) minmax(120px, 2fr) 92px 62px 130px 104px";

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", fontSize: 11.5, color: "var(--ink-muted)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span aria-hidden style={{ width: 22, height: 9, borderRadius: 3, background: "linear-gradient(90deg, var(--info), var(--acerto-green))" }} />
          quantidade de solicitações
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span aria-hidden style={{ width: 22, height: 9, borderRadius: 3, background: "var(--acerto-green)", opacity: 0.45 }} />
          valor estimado parado na etapa
        </span>
        <span>Clique numa etapa para abrir o Quadro já filtrado por ela.</span>
      </div>

      {totalCount === 0 && (
        <p style={{ fontSize: 12.5, color: "var(--ink-muted)", margin: 0 }}>
          Nenhuma solicitação no recorte atual. As etapas continuam clicáveis: o Quadro abre filtrado mesmo vazio.
        </p>
      )}

      {/* A tabela tem seis colunas e não encolhe abaixo de ~760px sem virar
          papa; em tela estreita ela rola sozinha, sem arrastar o painel. */}
      <div style={{ overflowX: "auto" }}>
        <TableWrap style={{ minWidth: 760 }}>
          <TableHeadRow columns={colunas}>
            <span>Etapa</span>
            <span>Quantidade e valor</span>
            <span style={{ textAlign: "right" }}>Solicitações</span>
            <span style={{ textAlign: "right" }}>% do total</span>
            <span style={{ textAlign: "right" }}>Valor estimado</span>
            <span style={{ textAlign: "right" }}>SLA vencido</span>
          </TableHeadRow>

          {stages.map((s) => {
            const larguraQtd = s.count > 0 ? Math.max(3, (s.count / maxCount) * 100) : 0;
            const larguraValor = s.value > 0 ? Math.max(3, (s.value / maxValue) * 100) : 0;
            const sharePct = totalCount > 0 ? (s.count / totalCount) * 100 : 0;
            return (
              <TableRow
                key={s.stage}
                href={`/solicitacoes?stage=${s.stage}`}
                columns={colunas}
                style={{ alignItems: "center", fontSize: 13 }}
              >
                <span style={{ fontWeight: 600 }}>{s.label}</span>
                <span style={{ display: "grid", gap: 4 }}>
                  <span aria-hidden style={{ display: "block", height: 10, borderRadius: 5, background: "var(--surface-muted)" }}>
                    <span style={{ display: "block", width: `${larguraQtd}%`, height: 10, borderRadius: 5, background: "linear-gradient(90deg, var(--info), var(--acerto-green))" }} />
                  </span>
                  <span aria-hidden style={{ display: "block", height: 10, borderRadius: 5, background: "var(--surface-muted)" }}>
                    <span style={{ display: "block", width: `${larguraValor}%`, height: 10, borderRadius: 5, background: "var(--acerto-green)", opacity: 0.45 }} />
                  </span>
                </span>
                <strong style={{ textAlign: "right" }}>{s.count}</strong>
                <span style={{ textAlign: "right", color: "var(--ink-muted)" }}>{sharePct.toFixed(0)}%</span>
                <span style={{ textAlign: "right" }}>{s.value > 0 ? money(s.value) : "-"}</span>
                <span style={{ textAlign: "right", fontWeight: s.overdueCount > 0 ? 700 : 400, color: s.overdueCount > 0 ? "var(--danger)" : "var(--ink-muted)" }}>
                  {s.overdueCount > 0 ? s.overdueCount : "-"}
                </span>
              </TableRow>
            );
          })}

          <TableRow columns={colunas} style={{ alignItems: "center", fontSize: 12.5, cursor: "default", borderTop: "1px solid var(--border)" }}>
            <strong>Total no recorte</strong>
            <span />
            <strong style={{ textAlign: "right" }}>{totalCount}</strong>
            <span />
            <strong style={{ textAlign: "right" }}>{totalValue > 0 ? money(totalValue) : "-"}</strong>
            <strong style={{ textAlign: "right", color: totalOverdue > 0 ? "var(--danger)" : "var(--ink-muted)" }}>
              {totalOverdue > 0 ? totalOverdue : "-"}
            </strong>
          </TableRow>
        </TableWrap>
      </div>

      <p style={{ fontSize: 11, color: "var(--ink-muted)", margin: 0 }}>
        Valor estimado é o da solicitação (pipeline inteiro), não o já negociado em Pedido de Compra. A coluna de SLA vencido
        conta as solicitações em aberto cujo prazo já passou, dentro daquela etapa.
      </p>
    </div>
  );
}
