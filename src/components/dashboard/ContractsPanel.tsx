import { Badge, TableWrap, TableHeadRow, TableRow } from "@/components/ui";

/**
 * Uma linha da lista de vencimentos. O painel fechado usa três destes campos
 * (fornecedor, área e dias restantes); o resto vem do mesmo registro e só cabe
 * na versão expandida.
 */
export type ContractRow = {
  id: string;
  supplierName: string;
  tradeName: string | null;
  area: string;
  costCenter: string;
  managerName: string | null;
  status: string;
  statusLabel: string;
  renewalDateLabel: string;
  endDateLabel: string;
  prazo: string | null;
  daysToRenewal: number;
};

export type ContractsPanelData = {
  active: number;
  renewing: number;
  expiring60d: number;
  critical30d: number;
  list: ContractRow[];
};

export type ContractsPanelDataFull = ContractsPanelData & {
  listaCompleta: ContractRow[];
  porArea: { area: string; total: number; ativos: number; emRenovacao: number; vencendo60d: number }[];
  totalCarteira: number;
};

function StatBlock({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <p style={{ fontSize: 24, fontWeight: 700, color, margin: 0, letterSpacing: "-0.02em" }}>{value}</p>
      <p style={{ fontSize: 11, color: "var(--ink-muted)", margin: "2px 0 0" }}>{label}</p>
    </div>
  );
}

export function ContractsPanel({ data }: { data: ContractsPanelData }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
        <StatBlock value={data.active} label="Ativos" color="var(--acerto-green-dark)" />
        <StatBlock value={data.renewing} label="Em renovação" color="var(--info)" />
        <StatBlock value={data.expiring60d} label="Vencendo em 60d" color="var(--warning)" />
        <StatBlock value={data.critical30d} label="Críticos (≤30d)" color="var(--danger)" />
      </div>
      {data.list.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--ink-muted)" }}>Nenhum contrato vencendo nos próximos 60 dias.</p>
      ) : (
        <div style={{ display: "grid", gap: 4 }}>
          {data.list.map((c) => (
            <a
              key={c.id}
              href="/contratos"
              style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink)", textDecoration: "none", padding: "6px 4px", borderRadius: 6 }}
            >
              <span><strong>{c.supplierName}</strong> · {c.area}</span>
              <span style={{ fontWeight: 700, color: prazoColor(c.daysToRenewal) }}>
                {c.daysToRenewal <= 0 ? "vencido" : `${c.daysToRenewal}d`}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function prazoColor(dias: number) {
  return dias <= 30 ? "var(--danger)" : "var(--warning)";
}

/**
 * Versão de tela cheia.
 *
 * O painel fechado corta em três lugares: a lista de vencimentos para em oito
 * linhas, cada linha diz só fornecedor, área e dias, e os quatro números do
 * topo resumem uma carteira que não aparece em lugar nenhum. Aqui a lista dos
 * 60 dias vem inteira, com a data, o gestor, o centro de custo e o status de
 * cada contrato, e a carteira aparece dividida por área.
 */
export function ContractsPanelExpandido({ data }: { data: ContractsPanelDataFull }) {
  const colunas = "1.9fr 1fr 1fr 1.2fr 1.1fr 0.9fr 0.9fr 0.7fr";
  const colunasArea = "2fr 0.8fr 0.8fr 1fr 1fr";
  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, maxWidth: 620 }}>
        <StatBlock value={data.active} label="Ativos" color="var(--acerto-green-dark)" />
        <StatBlock value={data.renewing} label="Em renovação" color="var(--info)" />
        <StatBlock value={data.expiring60d} label="Vencendo em 60d" color="var(--warning)" />
        <StatBlock value={data.critical30d} label="Críticos (≤30d)" color="var(--danger)" />
      </div>

      <section>
        <h3 style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)", margin: "0 0 8px" }}>Vencendo nos próximos 60 dias</h3>
        {data.listaCompleta.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Nenhum contrato vencendo nos próximos 60 dias.</p>
        ) : (
          <TableWrap style={{ boxShadow: "none", minWidth: 960 }}>
            <TableHeadRow columns={colunas}>
              <span>Fornecedor</span>
              <span>Área</span>
              <span>Centro de custo</span>
              <span>Gestor</span>
              <span>Status</span>
              <span>Renovação</span>
              <span>Fim da vigência</span>
              <span>Faltam</span>
            </TableHeadRow>
            {data.listaCompleta.map((c) => {
              // Nome fantasia e prazo contratual entram como segunda linha do
              // fornecedor: são texto livre e ficariam espremidos numa coluna
              // própria, e é aí que quem decide renovação olha primeiro.
              const detalhe = [c.tradeName, c.prazo].filter(Boolean).join(" · ");
              return (
                <TableRow key={c.id} href={`/contratos/${c.id}`} columns={colunas} style={{ alignItems: "center", fontSize: 12.5 }}>
                  <span>
                    <span style={{ display: "block", fontWeight: 600 }}>{c.supplierName}</span>
                    {detalhe && <span style={{ display: "block", fontSize: 11, color: "var(--ink-muted)" }}>{detalhe}</span>}
                  </span>
                  <span className="text-soft">{c.area}</span>
                  <span className="text-soft">{c.costCenter}</span>
                  <span className="text-soft">{c.managerName ?? "-"}</span>
                  <span>
                    <Badge variant={c.status === "RENOVACAO_EM_ANDAMENTO" ? "warning" : "green"}>{c.statusLabel}</Badge>
                  </span>
                  <span className="text-soft">{c.renewalDateLabel}</span>
                  <span className="text-soft">{c.endDateLabel}</span>
                  <span style={{ fontWeight: 700, color: prazoColor(c.daysToRenewal) }}>
                    {c.daysToRenewal <= 0 ? "vencido" : `${c.daysToRenewal}d`}
                  </span>
                </TableRow>
              );
            })}
          </TableWrap>
        )}
      </section>

      {data.porArea.length > 0 && (
        <section>
          <h3 style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)", margin: "0 0 8px" }}>Carteira por área</h3>
          <TableWrap style={{ boxShadow: "none", minWidth: 560 }}>
            <TableHeadRow columns={colunasArea}>
              <span>Área</span>
              <span>Contratos</span>
              <span>Ativos</span>
              <span>Em renovação</span>
              <span>Vencendo em 60d</span>
            </TableHeadRow>
            {data.porArea.map((a) => (
              <TableRow key={a.area} columns={colunasArea} style={{ alignItems: "center", cursor: "default", fontSize: 12.5 }}>
                <span style={{ fontWeight: 600 }}>{a.area}</span>
                <span className="text-soft">{a.total}</span>
                <span className="text-soft">{a.ativos}</span>
                <span className="text-soft">{a.emRenovacao}</span>
                <span style={{ fontWeight: 600, color: a.vencendo60d > 0 ? "var(--warning)" : "var(--ink-soft)" }}>{a.vencendo60d}</span>
              </TableRow>
            ))}
          </TableWrap>
          <p style={{ marginTop: 12, fontSize: 12, color: "var(--ink-muted)" }}>
            <strong style={{ color: "var(--ink)" }}>{data.totalCarteira}</strong> contrato(s) não cancelado(s) na carteira, em{" "}
            <strong style={{ color: "var(--ink)" }}>{data.porArea.length}</strong> área(s). A carteira não depende do período nem dos
            demais filtros do dashboard.
          </p>
        </section>
      )}
    </div>
  );
}
