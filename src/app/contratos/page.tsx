import { prisma } from "@/lib/db";
import { formatDateOnly } from "@/lib/format";
import { TopNav } from "@/components/TopNav";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  ATIVO: "badge-green",
  RENOVACAO_EM_ANDAMENTO: "badge-warning",
  CANCELADO: "badge-danger",
};

export default async function ContratosPage() {
  const contracts = await prisma.contract.findMany({
    include: { contractManager: true },
    orderBy: { renewalDate: "asc" },
  });

  return (
    <>
      <TopNav active="/contratos" />
      <main className="page" style={{ paddingTop: 28 }}>
        <a href="/solicitacoes" className="back-link">← voltar ao quadro</a>
        <h1 className="page-title" style={{ marginTop: 12 }}>Gestão de Contratos</h1>
        <p className="page-subtitle">{contracts.length} contrato(s) mapeado(s)</p>

        <div className="table-wrap section-gap">
          <div className="table-head-row" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr" }}>
            <span>Fornecedor</span>
            <span>Área</span>
            <span>Gestor</span>
            <span>Renovação</span>
            <span>Status</span>
          </div>
          {contracts.map((c) => (
            <a key={c.id} href={`/contratos/${c.id}`} className="table-row" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", alignItems: "center" }}>
              <span style={{ fontWeight: 700 }}>{c.supplierName}</span>
              <span className="text-soft">{c.area}</span>
              <span className="text-soft">{c.contractManager.name}</span>
              <span className="text-soft">{formatDateOnly(c.renewalDate)}</span>
              <span><span className={`badge ${STATUS_BADGE[c.status] ?? "badge-neutral"}`}>{c.status}</span></span>
            </a>
          ))}
          {contracts.length === 0 && (
            <p style={{ padding: 20, fontSize: 12.5, color: "var(--ink-muted)" }}>Nenhum contrato mapeado ainda.</p>
          )}
        </div>
      </main>
    </>
  );
}
