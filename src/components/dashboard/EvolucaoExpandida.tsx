import { money } from "@/lib/dashboard-data";
import { TableWrap, TableHeadRow, TableRow } from "@/components/ui";
import { TrendChartExpandido } from "./charts";

export type EvolucaoMesRow = { key: string; label: string; labelLong: string; value: number; saving: number };

/**
 * Conteúdo expandido do painel "Evolução das Compras e Saving".
 *
 * O que ele mostra a mais que o compacto: 24 meses em vez de 12, o valor
 * escrito em cima de cada barra, todos os meses legíveis no eixo, o eixo do
 * saving (que no compacto fica escondido) e a tabela mês a mês, que é o que
 * alguém copia para um relatório sem ter que ler altura de barra.
 *
 * É um Server Component: só o gráfico é cliente. A tabela, que é a parte
 * grande, é HTML pronto do servidor e não custa JS no navegador.
 */
export function EvolucaoExpandida({ rows }: { rows: EvolucaoMesRow[] }) {
  const semDado = rows.every((r) => r.value === 0 && r.saving === 0);

  // Sem nenhum Pedido de Compra no intervalo, o expandido seria um gráfico
  // achatado no zero seguido de 24 linhas de "R$ 0": mais vazio, e maior, que
  // o painel compacto. Nesse caso ele diz o que houve e para por aí.
  if (semDado) {
    return (
      <p style={{ fontSize: 13, color: "var(--ink-muted)", maxWidth: 620, lineHeight: 1.6 }}>
        Nenhum Pedido de Compra emitido nos últimos {rows.length} meses dentro deste recorte.
        A série mensal só conta valor já negociado em Pedido de Compra, então solicitações
        ainda em andamento não aparecem aqui. Vale conferir os filtros no topo do Dashboard.
      </p>
    );
  }

  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const totalSaving = rows.reduce((s, r) => s + r.saving, 0);
  const columns = "1.4fr 1fr 1fr";

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <p className="dash-section-subtitle" style={{ margin: 0 }}>
        Últimos {rows.length} meses · valor negociado (Pedidos de Compra) e saving mensal.
        O painel compacto mostra os 12 meses mais recentes desta mesma série.
      </p>

      <TrendChartExpandido data={rows} />

      <div>
        <p style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-soft)", marginBottom: 8 }}>
          Valores mês a mês
        </p>
        <div style={{ overflowX: "auto" }}>
          <TableWrap style={{ boxShadow: "none", minWidth: 420 }}>
            <TableHeadRow columns={columns}>
              <span>Mês</span>
              <span>Valor negociado</span>
              <span>Saving</span>
            </TableHeadRow>
            {rows.map((r) => (
              <TableRow key={r.key} columns={columns} style={{ alignItems: "center", cursor: "default", fontSize: 12.5 }}>
                <span>{r.labelLong}</span>
                <span className="text-soft">{money(r.value)}</span>
                <span style={{ color: r.saving > 0 ? "var(--acerto-green-dark)" : "var(--ink-soft)", fontWeight: r.saving > 0 ? 600 : 400 }}>
                  {money(r.saving)}
                </span>
              </TableRow>
            ))}
            {/* Soma da coluna, não um KPI: os KPIs do topo do Dashboard são do
                período filtrado, este total é dos meses listados aqui. Daí o
                rótulo dizer quantos meses são. */}
            <TableRow columns={columns} style={{ alignItems: "center", cursor: "default", fontSize: 12.5, fontWeight: 700, borderTop: "1px solid var(--border)" }}>
              <span>Total ({rows.length} meses)</span>
              <span>{money(totalValue)}</span>
              <span style={{ color: totalSaving > 0 ? "var(--acerto-green-dark)" : "var(--ink)" }}>{money(totalSaving)}</span>
            </TableRow>
          </TableWrap>
        </div>
      </div>
    </div>
  );
}
