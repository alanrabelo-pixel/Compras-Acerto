import { money } from "@/lib/dashboard-data";
import { TableWrap, TableHeadRow, TableRow } from "@/components/ui";

export type SupplierRow = { name: string; value: number; count: number; avgSaving: number; avgLeadTime: number | null; score: number };

function scoreColor(score: number) {
  if (score >= 75) return "var(--acerto-green-dark)";
  if (score >= 50) return "var(--warning)";
  return "var(--danger)";
}

/**
 * Score de confiabilidade: fórmula interna e transparente (não é uma nota de
 * mercado): 40% risco cadastral do fornecedor, 20% se já é homologado, 40%
 * saving médio entregue. Ver cálculo em src/lib/dashboard-data.ts.
 */
export function TopSuppliersTable({ rows }: { rows: SupplierRow[] }) {
  if (rows.length === 0) {
    return <p style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Nenhum Pedido de Compra emitido neste recorte.</p>;
  }
  const columns = "2fr 1.1fr 0.7fr 0.9fr 0.9fr 0.8fr";
  return (
    <div style={{ overflowX: "auto" }}>
      <TableWrap style={{ boxShadow: "none", minWidth: 480 }}>
        <TableHeadRow columns={columns}>
          <span>Fornecedor</span>
          <span>Valor</span>
          <span>Qtd.</span>
          <span>Saving</span>
          <span>Lead Time</span>
          <span title="Fórmula interna: risco cadastral + homologação + saving médio">Score ⓘ</span>
        </TableHeadRow>
        {rows.map((r) => (
          <TableRow key={r.name} columns={columns} style={{ alignItems: "center", cursor: "default" }}>
            <span style={{ fontWeight: 600 }}>{r.name}</span>
            <span className="text-soft">{money(r.value)}</span>
            <span className="text-soft">{r.count}</span>
            <span style={{ color: r.avgSaving >= 0 ? "var(--acerto-green-dark)" : "var(--danger)", fontWeight: 600 }}>{r.avgSaving.toFixed(1)}%</span>
            <span className="text-soft">{r.avgLeadTime === null ? "-" : `${r.avgLeadTime.toFixed(1)}d`}</span>
            <span style={{ fontWeight: 700, color: scoreColor(r.score) }}>{r.score}</span>
          </TableRow>
        ))}
      </TableWrap>
    </div>
  );
}
