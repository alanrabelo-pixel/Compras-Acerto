import { money } from "@/lib/dashboard-data";
import { TableWrap, TableHeadRow, TableRow } from "@/components/ui";
import { BarraParticipacao } from "./BarraParticipacao";

export type BuyerRow = { name: string; count: number; value: number; avgSaving: number | null; slaPct: number | null };

/**
 * O que a versão compacta não mostra: o saving (que já chegava até aqui em
 * `avgSaving` e não tinha coluna onde caber), quanto isso deu em reais, e as
 * duas contagens por trás do percentual de SLA.
 */
export type BuyerRowFull = BuyerRow & {
  savingAmount: number;
  concludedOnTime: number;
  concludedTotal: number;
  sharePct: number;
};

function slaColor(slaPct: number | null) {
  if (slaPct === null) return "var(--ink-muted)";
  return slaPct >= 80 ? "var(--acerto-green-dark)" : "var(--warning)";
}

export function BuyerRanking({ rows }: { rows: BuyerRow[] }) {
  if (rows.length === 0) {
    return <p style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Nenhuma solicitação com comprador atribuído neste recorte.</p>;
  }
  return (
    <div style={{ display: "grid", gap: 2 }}>
      {rows.map((r, i) => (
        <div
          key={r.name}
          style={{
            display: "grid", gridTemplateColumns: "24px 1.6fr 1fr 0.8fr 0.8fr", alignItems: "center",
            gap: 8, padding: "9px 4px", borderBottom: i < rows.length - 1 ? "1px solid var(--border-soft)" : "none", fontSize: 12.5,
          }}
        >
          <span style={{ fontWeight: 700, color: "var(--ink-muted)" }}>{i + 1}º</span>
          <span style={{ fontWeight: 600 }}>{r.name}</span>
          <span className="text-soft">{money(r.value)}</span>
          <span className="text-soft">{r.count} sol.</span>
          <span style={{ fontWeight: 600, color: slaColor(r.slaPct) }}>
            {r.slaPct === null ? "-" : `${r.slaPct.toFixed(0)}% SLA`}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Versão de tela cheia: todos os compradores do recorte (o painel corta nos 10
 * primeiros), com cabeçalho de coluna, que a lista compacta também não tem.
 */
export function BuyerRankingExpandido({ rows, slaMedia }: { rows: BuyerRowFull[]; slaMedia: number | null }) {
  if (rows.length === 0) {
    return <p style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Nenhuma solicitação com comprador atribuído neste recorte.</p>;
  }
  const columns = "34px 2.1fr 1.2fr 0.9fr 0.9fr 1.1fr 0.8fr 1.2fr 0.8fr";
  const somaValor = rows.reduce((s, r) => s + r.value, 0);
  const somaSolicitacoes = rows.reduce((s, r) => s + r.count, 0);
  const somaEconomia = rows.reduce((s, r) => s + r.savingAmount, 0);
  return (
    <div>
      <TableWrap style={{ boxShadow: "none", minWidth: 900 }}>
        <TableHeadRow columns={columns}>
          <span>#</span>
          <span>Comprador</span>
          <span>Valor estimado</span>
          <span>% da carteira</span>
          <span>Solicitações</span>
          <span>Concluídas no prazo</span>
          <span>SLA</span>
          <span>Economia (R$)</span>
          <span>Saving</span>
        </TableHeadRow>
        {rows.map((r, i) => (
          <TableRow key={r.name} columns={columns} style={{ alignItems: "center", cursor: "default", fontSize: 12.5 }}>
            <span style={{ fontWeight: 700, color: "var(--ink-muted)" }}>{i + 1}</span>
            <span style={{ fontWeight: 600 }}>{r.name}</span>
            <span className="text-soft">{money(r.value)}</span>
            <BarraParticipacao pct={r.sharePct} />
            <span className="text-soft">{r.count}</span>
            <span className="text-soft">
              {r.concludedTotal === 0 ? "nenhuma concluída" : `${r.concludedOnTime} de ${r.concludedTotal}`}
            </span>
            <span style={{ fontWeight: 600, color: slaColor(r.slaPct) }}>{r.slaPct === null ? "-" : `${r.slaPct.toFixed(0)}%`}</span>
            <span style={{ fontWeight: 600, color: r.savingAmount >= 0 ? "var(--acerto-green-dark)" : "var(--danger)" }}>{money(r.savingAmount)}</span>
            <span style={{ fontWeight: 600, color: r.avgSaving === null ? "var(--ink-muted)" : r.avgSaving >= 0 ? "var(--acerto-green-dark)" : "var(--danger)" }}>
              {r.avgSaving === null ? "-" : `${r.avgSaving.toFixed(1)}%`}
            </span>
          </TableRow>
        ))}
      </TableWrap>

      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, marginTop: 12, fontSize: 12, color: "var(--ink-muted)" }}>
        <span>
          <strong style={{ color: "var(--ink)" }}>{rows.length}</strong> comprador(es) ·{" "}
          <strong style={{ color: "var(--ink)" }}>{somaSolicitacoes}</strong> solicitação(ões) ·{" "}
          <strong style={{ color: "var(--ink)" }}>{money(somaValor)}</strong> estimado ·{" "}
          <strong style={{ color: "var(--acerto-green-dark)" }}>{money(somaEconomia)}</strong> economizado
        </span>
        {slaMedia !== null && (
          // Esta é exatamente a média que os Alertas Inteligentes usam como
          // referência, e ela é calculada sobre os 10 maiores por valor. Se a
          // lista aqui for maior que 10, o rótulo tem que dizer isso, senão o
          // número parece a média de todo mundo na tabela.
          <span>
            Média de SLA {rows.length > 10 ? "dos 10 maiores compradores por valor" : "dos compradores"}:{" "}
            <strong style={{ color: "var(--ink)" }}>{slaMedia.toFixed(0)}%</strong>
          </span>
        )}
      </div>
    </div>
  );
}
