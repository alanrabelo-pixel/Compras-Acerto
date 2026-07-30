export type RiskMapData = {
  singleSupplierConcentrationPct: number;
  topSupplierName: string | null;
  topCategoryConcentrationPct: number;
  topCategoryLabel: string | null;
  emergencyCount: number;
  noContractCount: number;
  overdueCount: number;
  criticalSuppliersCount: number;
  fragmentationCount: number;
  budgetExceptionsPending: number;
  personifiedApprovals: number;
};

function RiskCard({
  value, label, detail, severity,
}: { value: string | number; label: string; detail?: string; severity: "danger" | "warning" | "neutral" }) {
  const color = severity === "danger" ? "var(--danger)" : severity === "warning" ? "var(--warning)" : "var(--ink)";
  const bg = severity === "danger" ? "var(--danger-bg)" : severity === "warning" ? "var(--warning-bg)" : "var(--surface-muted)";
  return (
    <div style={{ background: bg, borderRadius: 10, padding: 12 }}>
      <p style={{ fontSize: 20, fontWeight: 700, color, margin: 0, letterSpacing: "-0.02em" }}>{value}</p>
      <p style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink)", margin: "2px 0 0" }}>{label}</p>
      {detail && <p style={{ fontSize: 10.5, color: "var(--ink-muted)", margin: "2px 0 0" }}>{detail}</p>}
    </div>
  );
}

export function RiskMap({ data }: { data: RiskMapData }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
      <RiskCard
        value={`${data.singleSupplierConcentrationPct.toFixed(0)}%`}
        label="Concentração no maior fornecedor"
        detail={data.topSupplierName ?? undefined}
        severity={data.singleSupplierConcentrationPct > 40 ? "danger" : data.singleSupplierConcentrationPct > 25 ? "warning" : "neutral"}
      />
      <RiskCard
        value={`${data.topCategoryConcentrationPct.toFixed(0)}%`}
        label="Concentração na maior categoria"
        detail={data.topCategoryLabel ?? undefined}
        severity={data.topCategoryConcentrationPct > 60 ? "warning" : "neutral"}
      />
      <RiskCard value={data.emergencyCount} label="Compras com prioridade Crítica" severity={data.emergencyCount > 0 ? "warning" : "neutral"} />
      <RiskCard value={data.noContractCount} label="Precisam de contrato, ainda sem mapeamento" severity={data.noContractCount > 0 ? "warning" : "neutral"} />
      <RiskCard value={data.overdueCount} label="Pedidos com SLA vencido" severity={data.overdueCount > 0 ? "danger" : "neutral"} />
      <RiskCard value={data.criticalSuppliersCount} label="Fornecedores com risco Alto cadastrado" severity={data.criticalSuppliersCount > 0 ? "danger" : "neutral"} />
      <RiskCard value={data.fragmentationCount} label="Risco de fracionamento (mesmo fornecedor)" severity={data.fragmentationCount > 0 ? "warning" : "neutral"} />
      <RiskCard value={data.budgetExceptionsPending} label="Exceções orçamentárias pendentes" severity={data.budgetExceptionsPending > 0 ? "warning" : "neutral"} />
      <RiskCard value={data.personifiedApprovals} label="Aprovações por personificação" severity={data.personifiedApprovals > 0 ? "warning" : "neutral"} />
    </div>
  );
}
