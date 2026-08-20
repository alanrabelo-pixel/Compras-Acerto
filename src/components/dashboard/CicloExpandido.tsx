import { TableWrap, TableHeadRow, TableRow } from "@/components/ui";
import { CycleHistogramExpandido } from "./charts";

export type CicloFaixaRow = { label: string; count: number };

/**
 * Conteúdo expandido do painel "Tempo de Ciclo".
 *
 * O que ele mostra a mais que o compacto: as mesmas solicitações concluídas
 * em 11 faixas em vez de 5, a quantidade escrita em cima de cada barra e a
 * tabela com o número absoluto por faixa. O compacto responde "a maioria leva
 * de 11 a 20 dias"; o expandido responde "quantas, exatamente, e em que ponto
 * dentro da faixa".
 *
 * Server Component: só o histograma é cliente.
 */
export function CicloExpandido({ rows }: { rows: CicloFaixaRow[] }) {
  const total = rows.reduce((s, r) => s + r.count, 0);

  // Nenhuma solicitação concluída no recorte: não existe distribuição para
  // detalhar, e onze barras zeradas em tela cheia seriam pior que as cinco
  // barras zeradas do compacto.
  if (total === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--ink-muted)", maxWidth: 620, lineHeight: 1.6 }}>
        Nenhuma solicitação foi concluída no período filtrado, então não há distribuição de
        tempo de ciclo para detalhar. O ciclo é contado da abertura da solicitação até a
        entrada na etapa Concluído, e só entra aqui quem já chegou lá.
      </p>
    );
  }

  const columns = "1fr 1fr 1fr";

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <p className="dash-section-subtitle" style={{ margin: 0 }}>
        Distribuição das {total} solicitação(ões) concluídas no período, por faixa de dias entre
        a abertura e a conclusão. As faixas do painel compacto são somas destas: 0–5 dias é
        0–2 mais 3–5, e assim por diante.
      </p>

      <CycleHistogramExpandido data={rows} />

      <div>
        <p style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-soft)", marginBottom: 8 }}>
          Quantidade por faixa
        </p>
        <div style={{ overflowX: "auto" }}>
          <TableWrap style={{ boxShadow: "none", minWidth: 360 }}>
            <TableHeadRow columns={columns}>
              <span>Faixa (dias)</span>
              <span>Solicitações</span>
              <span>% do total</span>
            </TableHeadRow>
            {rows.map((r) => (
              <TableRow key={r.label} columns={columns} style={{ alignItems: "center", cursor: "default", fontSize: 12.5 }}>
                <span>{r.label}</span>
                <span style={{ fontWeight: r.count > 0 ? 600 : 400, color: r.count > 0 ? "var(--ink)" : "var(--ink-muted)" }}>{r.count}</span>
                {/* Participação da faixa no total listado: é a leitura direta
                    da mesma contagem, não um indicador novo. toLocaleString e
                    não toFixed: toFixed devolve "2.5" com ponto, e o resto do
                    Dashboard escreve decimal com vírgula. */}
                <span className="text-soft">
                  {((r.count / total) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                </span>
              </TableRow>
            ))}
            <TableRow columns={columns} style={{ alignItems: "center", cursor: "default", fontSize: 12.5, fontWeight: 700, borderTop: "1px solid var(--border)" }}>
              <span>Total</span>
              <span>{total}</span>
              <span>100,0%</span>
            </TableRow>
          </TableWrap>
        </div>
      </div>
    </div>
  );
}
