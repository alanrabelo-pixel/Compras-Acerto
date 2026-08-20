import { money } from "@/lib/dashboard-data";
import { RISK_TIER_LABEL, rotulo } from "@/lib/rotulos";
import { Badge, TableWrap, TableHeadRow, TableRow } from "@/components/ui";
import { BarraParticipacao } from "./BarraParticipacao";

export type SupplierRow = { name: string; value: number; count: number; avgSaving: number; avgLeadTime: number | null; score: number };

/**
 * O que a versão compacta não tem largura para carregar: CNPJ, participação no
 * gasto, quanto foi economizado em reais (o painel só mostra o percentual),
 * risco cadastral e homologação (que são 60% do score exibido ao lado).
 */
export type SupplierRowFull = SupplierRow & {
  cnpj: string;
  savingAmount: number;
  riskTier: string | null;
  approvedVendor: boolean | null;
  sharePct: number;
};

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

/**
 * Versão de tela cheia: o recorte inteiro (o painel corta nos 10 primeiros) e
 * as colunas que não cabiam. Recebe tudo pronto do servidor, ver
 * PainelExpansivel.tsx.
 */
export function TopSuppliersTableExpandida({ rows }: { rows: SupplierRowFull[] }) {
  if (rows.length === 0) {
    return <p style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Nenhum Pedido de Compra emitido neste recorte.</p>;
  }
  const columns = "34px 2.3fr 1.2fr 0.9fr 0.7fr 1.2fr 0.8fr 0.9fr 1.4fr 0.7fr";
  const somaValor = rows.reduce((s, r) => s + r.value, 0);
  const somaEconomia = rows.reduce((s, r) => s + r.savingAmount, 0);
  const somaPedidos = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div>
      <TableWrap style={{ boxShadow: "none", minWidth: 940 }}>
        <TableHeadRow columns={columns}>
          <span>#</span>
          <span>Fornecedor</span>
          <span>Valor negociado</span>
          <span>% do gasto</span>
          <span>Pedidos</span>
          <span>Economia (R$)</span>
          <span>Saving</span>
          <span>Lead Time</span>
          <span>Cadastro</span>
          <span>Score</span>
        </TableHeadRow>
        {rows.map((r, i) => (
          <TableRow key={`${r.name}-${r.cnpj}`} columns={columns} style={{ alignItems: "center", cursor: "default", fontSize: 12.5 }}>
            <span style={{ fontWeight: 700, color: "var(--ink-muted)" }}>{i + 1}</span>
            <span>
              <span style={{ display: "block", fontWeight: 600 }}>{r.name}</span>
              <span style={{ display: "block", fontSize: 11, color: "var(--ink-muted)" }}>{r.cnpj}</span>
            </span>
            <span className="text-soft">{money(r.value)}</span>
            <BarraParticipacao pct={r.sharePct} />
            <span className="text-soft">{r.count}</span>
            <span style={{ color: r.savingAmount >= 0 ? "var(--acerto-green-dark)" : "var(--danger)", fontWeight: 600 }}>{money(r.savingAmount)}</span>
            <span style={{ color: r.avgSaving >= 0 ? "var(--acerto-green-dark)" : "var(--danger)", fontWeight: 600 }}>{r.avgSaving.toFixed(1)}%</span>
            <span className="text-soft">{r.avgLeadTime === null ? "-" : `${r.avgLeadTime.toFixed(1)}d`}</span>
            <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {r.riskTier === null ? (
                // Fornecedor sem cadastro ligado ao Pedido de Compra (razão
                // social digitada à mão): não há risco nem homologação para
                // mostrar, e fingir "não homologado" seria afirmar algo falso.
                <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>Sem cadastro</span>
              ) : (
                <>
                  <Badge variant={r.riskTier === "BAIXO" ? "green" : r.riskTier === "ALTO" ? "danger" : "warning"}>
                    {rotulo(RISK_TIER_LABEL, r.riskTier)}
                  </Badge>
                  {r.approvedVendor ? <Badge variant="green">Homologado</Badge> : <Badge variant="neutral">Não homologado</Badge>}
                </>
              )}
            </span>
            <span style={{ fontWeight: 700, color: scoreColor(r.score) }}>{r.score}</span>
          </TableRow>
        ))}
      </TableWrap>

      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, marginTop: 12, fontSize: 12, color: "var(--ink-muted)" }}>
        <span>
          <strong style={{ color: "var(--ink)" }}>{rows.length}</strong> fornecedor(es) no recorte ·{" "}
          <strong style={{ color: "var(--ink)" }}>{somaPedidos}</strong> pedido(s) ·{" "}
          <strong style={{ color: "var(--ink)" }}>{money(somaValor)}</strong> negociado ·{" "}
          <strong style={{ color: "var(--acerto-green-dark)" }}>{money(somaEconomia)}</strong> economizado
        </span>
        <span style={{ maxWidth: 520 }}>
          Score: 40% risco cadastral + 20% homologação + 40% saving médio entregue. É uma leitura interna e auditável, não uma nota de mercado.
        </span>
      </div>
    </div>
  );
}
