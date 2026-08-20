import { money } from "@/lib/dashboard-data";
import { TableWrap, TableHeadRow, TableRow } from "@/components/ui";

/**
 * Compras por Centro de Custo, versão de tela cheia.
 *
 * O gráfico do painel (CostCenterBarHorizontal, recharts) corta em dez barras,
 * trunca o nome do centro em 140px de eixo e não escreve valor nenhum: o número
 * só aparece no tooltip, um de cada vez, e não existe tooltip em toque nem em
 * leitor de tela. Aqui a lista é inteira, o nome é inteiro, e o valor, a
 * quantidade de solicitações e a participação ficam ao lado da barra.
 *
 * Não usa recharts de propósito: sem eixo e sem tooltip para desenhar, uma
 * barra é uma div com largura em porcentagem, e isto continua sendo Server
 * Component (zero JS no cliente).
 */
export type CostCenterRow = { label: string; value: number; count: number; sharePct: number };

export function CostCenterBreakdownList({ rows }: { rows: CostCenterRow[] }) {
  if (rows.length === 0) {
    return <p style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Nenhuma solicitação no recorte atual.</p>;
  }
  const columns = "1.9fr 1.6fr 1.1fr 0.9fr 0.7fr";
  const maior = Math.max(1, ...rows.map((r) => r.value));
  const somaValor = rows.reduce((s, r) => s + r.value, 0);
  const somaSolicitacoes = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div>
      <TableWrap style={{ boxShadow: "none", minWidth: 720 }}>
        <TableHeadRow columns={columns}>
          <span>Centro de custo</span>
          {/* Coluna da barra: sem rótulo, mas a célula de cabeçalho existe,
              senão a contagem de colunas do leitor de tela sai errada. */}
          <span />
          <span>Valor estimado</span>
          <span>Solicitações</span>
          <span>% do total</span>
        </TableHeadRow>
        {rows.map((r) => (
          <TableRow key={r.label} columns={columns} style={{ alignItems: "center", cursor: "default", fontSize: 12.5 }}>
            <span style={{ fontWeight: 600 }}>{r.label}</span>
            <span>
              <span style={{ display: "block", height: 8, borderRadius: 4, background: "var(--surface-muted)" }}>
                <span style={{ display: "block", height: "100%", width: `${(r.value / maior) * 100}%`, borderRadius: 4, background: "var(--acerto-green)" }} />
              </span>
            </span>
            <span className="text-soft">{money(r.value)}</span>
            <span className="text-soft">{r.count}</span>
            <span style={{ fontWeight: 600 }}>{r.sharePct.toFixed(1)}%</span>
          </TableRow>
        ))}
      </TableWrap>

      <p style={{ marginTop: 12, fontSize: 12, color: "var(--ink-muted)" }}>
        <strong style={{ color: "var(--ink)" }}>{rows.length}</strong> centro(s) de custo ·{" "}
        <strong style={{ color: "var(--ink)" }}>{somaSolicitacoes}</strong> solicitação(ões) ·{" "}
        <strong style={{ color: "var(--ink)" }}>{money(somaValor)}</strong> estimado
        {rows.length > 10 && " · o painel fechado mostra os 10 primeiros"}
      </p>
    </div>
  );
}
