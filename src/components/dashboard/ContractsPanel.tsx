export type ContractsPanelData = {
  active: number;
  renewing: number;
  expiring60d: number;
  critical30d: number;
  list: { id: string; supplierName: string; area: string; daysToRenewal: number }[];
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
              <span style={{ fontWeight: 700, color: c.daysToRenewal <= 30 ? "var(--danger)" : "var(--warning)" }}>
                {c.daysToRenewal <= 0 ? "vencido" : `${c.daysToRenewal}d`}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
