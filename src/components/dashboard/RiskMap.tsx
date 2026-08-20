import { money } from "@/lib/dashboard-data";
import { TableWrap, TableHeadRow, TableRow } from "@/components/ui";

export type RiskMapData = {
  singleSupplierConcentrationPct: number;
  topSupplierName: string | null;
  emergencyCount: number;
  noContractCount: number;
  overdueCount: number;
  criticalSuppliersCount: number;
  fragmentationCount: number;
  budgetExceptionsPending: number;
  personifiedApprovals: number;
};

/** Uma solicitação por trás de um dos cartões de risco. */
export type RiskRequestRow = {
  id: string;
  code: string;
  shortDescription: string;
  stageLabel: string;
  costCenterName: string;
  buyerName: string | null;
  value: number;
};

/** Uma solicitação em aberto com o prazo já estourado. */
export type RiskOverdueRow = {
  id: string;
  code: string;
  shortDescription: string;
  stageLabel: string;
  buyerName: string | null;
  costCenterName: string;
  value: number;
  daysLate: number;
};

/** As listas que produziram as contagens dos cartões (ver dashboard-data.ts). */
export type RiskDetails = {
  criticalSuppliers: { name: string; poCount: number; value: number; approvedVendor: boolean }[];
  emergency: RiskRequestRow[];
  noContract: RiskRequestRow[];
  fragmentation: RiskRequestRow[];
  budgetExceptions: {
    id: string; requestId: string; code: string; shortDescription: string;
    costCenterName: string; level: number; justification: string | null; value: number;
  }[];
  personified: {
    id: string; requestId: string; code: string; shortDescription: string;
    level: number; approverName: string; personifierName: string; justification: string | null;
  }[];
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

/**
 * Os oito cartões do mapa. Vivem aqui, e não repetidos nas duas versões do
 * painel, para que compacto e expandido não possam mostrar cartões diferentes;
 * a única diferença entre os dois é quantas colunas a grade abre.
 */
function RiskCards({ data, gridTemplateColumns }: { data: RiskMapData; gridTemplateColumns: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns, gap: 10 }}>
      <RiskCard
        value={`${data.singleSupplierConcentrationPct.toFixed(0)}%`}
        label="Concentração no maior fornecedor"
        detail={data.topSupplierName ?? undefined}
        severity={data.singleSupplierConcentrationPct > 40 ? "danger" : data.singleSupplierConcentrationPct > 25 ? "warning" : "neutral"}
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

export function RiskMap({ data }: { data: RiskMapData }) {
  return <RiskCards data={data} gridTemplateColumns="repeat(3, 1fr)" />;
}

// ---------------------------------------------------------------------------
// Versão expandida
// ---------------------------------------------------------------------------

/** Justificativa é texto livre e pode ter parágrafos; na linha de apoio cabe uma frase. */
function resumo(texto: string | null, limite = 90) {
  if (!texto) return null;
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (!limpo) return null;
  return limpo.length > limite ? `${limpo.slice(0, limite)}…` : limpo;
}

function BlocoRisco({
  titulo, contagem, severidade = "warning", children,
}: { titulo: string; contagem: number; severidade?: "danger" | "warning"; children: React.ReactNode }) {
  return (
    <section style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
      <header
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
          padding: "9px 12px", background: severidade === "danger" ? "var(--danger-bg)" : "var(--warning-bg)",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>{titulo}</h3>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: severidade === "danger" ? "var(--danger)" : "var(--warning)" }}>
          {contagem}
        </span>
      </header>
      <div style={{ display: "grid" }}>{children}</div>
    </section>
  );
}

function ItemSolicitacao({ r }: { r: RiskRequestRow }) {
  return (
    <a
      href={`/solicitacoes/${r.id}`}
      style={{
        display: "grid", gap: 2, padding: "9px 12px", textDecoration: "none",
        color: "var(--ink)", borderTop: "1px solid var(--border-soft)",
      }}
    >
      <span style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between", gap: 10 }}>
        <span><strong>{r.code}</strong> · {r.shortDescription}</span>
        <span style={{ flex: "none", color: "var(--ink-soft)" }}>{r.value > 0 ? money(r.value) : "-"}</span>
      </span>
      <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>
        {r.stageLabel} · {r.costCenterName}
        {r.buyerName ? ` · ${r.buyerName}` : ""}
      </span>
    </a>
  );
}

/**
 * O mapa de riscos em tela cheia.
 *
 * O painel compacto é uma parede de oito números e uma lista de seis pedidos
 * atrasados cortada com "+N outro(s)". Um número de compliance sem nome não
 * leva a lugar nenhum: "3 aprovações por personificação" só vira trabalho
 * quando diz em quais solicitações, quem aprovou e quem clicou no lugar de
 * quem. É isso que esta versão acrescenta: cada cartão com contagem maior que
 * zero ganha, abaixo, a lista inteira que o gerou, sem corte.
 *
 * Os cartões continuam iguais, na mesma ordem, porque é por eles que a pessoa
 * se orienta ao chegar aqui vinda do painel compacto.
 */
export function RiskMapExpandido({
  data, details, overdue,
}: { data: RiskMapData; details: RiskDetails; overdue: RiskOverdueRow[] }) {
  const colunasAtraso = "minmax(200px, 2fr) minmax(120px, 1fr) minmax(110px, 1fr) 120px 96px";
  const blocos = [
    details.criticalSuppliers.length,
    details.emergency.length,
    details.noContract.length,
    details.fragmentation.length,
    details.budgetExceptions.length,
    details.personified.length,
  ];
  const nadaParaDetalhar = overdue.length === 0 && blocos.every((n) => n === 0);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <RiskCards data={data} gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" />

      {nadaParaDetalhar && (
        <p style={{ fontSize: 12.5, color: "var(--ink-muted)", margin: 0 }}>
          Nenhuma das frentes acima tem item aberto neste recorte, então não há lista a detalhar. A concentração de
          fornecedor é a única leitura que continua valendo mesmo em zero, e o ranking completo dela está no painel
          Top Fornecedores.
        </p>
      )}

      {overdue.length > 0 && (
        <section style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--danger)" }}>
              Pedidos com SLA vencido ({overdue.length})
            </h3>
            <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>
              A lista completa, do mais atrasado para o menos. O painel compacto mostra os seis primeiros.
            </span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <TableWrap style={{ minWidth: 720 }}>
              <TableHeadRow columns={colunasAtraso}>
                <span>Solicitação</span>
                <span>Etapa</span>
                <span>Comprador</span>
                <span style={{ textAlign: "right" }}>Valor estimado</span>
                <span style={{ textAlign: "right" }}>Atraso</span>
              </TableHeadRow>
              {overdue.map((r) => (
                <TableRow key={r.id} href={`/solicitacoes/${r.id}`} columns={colunasAtraso} style={{ alignItems: "center", fontSize: 12.5 }}>
                  <span>
                    <strong>{r.code}</strong> · {r.shortDescription}
                    <span style={{ display: "block", fontSize: 11, color: "var(--ink-muted)" }}>{r.costCenterName}</span>
                  </span>
                  <span style={{ color: "var(--ink-soft)" }}>{r.stageLabel}</span>
                  <span style={{ color: "var(--ink-soft)" }}>{r.buyerName ?? "sem comprador"}</span>
                  <span style={{ textAlign: "right" }}>{r.value > 0 ? money(r.value) : "-"}</span>
                  <strong style={{ textAlign: "right", color: "var(--danger)" }}>{r.daysLate}d</strong>
                </TableRow>
              ))}
            </TableWrap>
          </div>
        </section>
      )}

      {!nadaParaDetalhar && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 12, alignItems: "start" }}>
          {details.criticalSuppliers.length > 0 && (
            <BlocoRisco titulo="Fornecedores com risco Alto cadastrado" contagem={details.criticalSuppliers.length} severidade="danger">
              {details.criticalSuppliers.map((s) => (
                <div key={s.name} style={{ display: "grid", gap: 2, padding: "9px 12px", borderTop: "1px solid var(--border-soft)" }}>
                  <span style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <strong>{s.name}</strong>
                    <span style={{ flex: "none", color: "var(--ink-soft)" }}>{money(s.value)}</span>
                  </span>
                  <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>
                    {s.poCount} pedido(s) no período · {s.approvedVendor ? "fornecedor homologado" : "sem homologação"}
                  </span>
                </div>
              ))}
            </BlocoRisco>
          )}

          {details.emergency.length > 0 && (
            <BlocoRisco titulo="Compras com prioridade Crítica" contagem={details.emergency.length}>
              {details.emergency.map((r) => <ItemSolicitacao key={r.id} r={r} />)}
            </BlocoRisco>
          )}

          {details.noContract.length > 0 && (
            <BlocoRisco titulo="Precisam de contrato, ainda sem mapeamento" contagem={details.noContract.length}>
              {details.noContract.map((r) => <ItemSolicitacao key={r.id} r={r} />)}
            </BlocoRisco>
          )}

          {details.fragmentation.length > 0 && (
            <BlocoRisco titulo="Risco de fracionamento (mesmo fornecedor)" contagem={details.fragmentation.length}>
              {details.fragmentation.map((r) => <ItemSolicitacao key={r.id} r={r} />)}
            </BlocoRisco>
          )}

          {details.budgetExceptions.length > 0 && (
            <BlocoRisco titulo="Exceções orçamentárias pendentes" contagem={details.budgetExceptions.length}>
              {details.budgetExceptions.map((b) => (
                <a
                  key={b.id}
                  href={`/solicitacoes/${b.requestId}`}
                  style={{ display: "grid", gap: 2, padding: "9px 12px", textDecoration: "none", color: "var(--ink)", borderTop: "1px solid var(--border-soft)" }}
                >
                  <span style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span><strong>{b.code}</strong> · {b.shortDescription}</span>
                    <span style={{ flex: "none", color: "var(--ink-soft)" }}>{b.value > 0 ? money(b.value) : "-"}</span>
                  </span>
                  <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>
                    Nível {b.level} · {b.costCenterName}
                    {resumo(b.justification) ? ` · ${resumo(b.justification)}` : ""}
                  </span>
                </a>
              ))}
            </BlocoRisco>
          )}

          {details.personified.length > 0 && (
            <BlocoRisco titulo="Aprovações por personificação" contagem={details.personified.length}>
              {details.personified.map((a) => (
                <a
                  key={a.id}
                  href={`/solicitacoes/${a.requestId}`}
                  style={{ display: "grid", gap: 2, padding: "9px 12px", textDecoration: "none", color: "var(--ink)", borderTop: "1px solid var(--border-soft)" }}
                >
                  <span style={{ fontSize: 12.5 }}><strong>{a.code}</strong> · {a.shortDescription}</span>
                  <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>
                    Nível {a.level} · aprovação de {a.approverName}, registrada por {a.personifierName}
                    {resumo(a.justification) ? ` · ${resumo(a.justification)}` : ""}
                  </span>
                </a>
              ))}
            </BlocoRisco>
          )}
        </div>
      )}
    </div>
  );
}
