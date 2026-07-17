import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { ContractActions } from "@/components/ContractActions";
import { formatDateOnly } from "@/lib/format";
import { TopNav } from "@/components/TopNav";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  ATIVO: "badge-green",
  RENOVACAO_EM_ANDAMENTO: "badge-warning",
  CANCELADO: "badge-danger",
};

export default async function ContractDetailPage({ params }: { params: { id: string } }) {
  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    include: { contractManager: true, alerts: { orderBy: { sentAt: "desc" } }, request: true },
  });
  if (!contract) notFound();

  return (
    <>
      <TopNav active="/contratos" />
      <main className="page-narrow" style={{ paddingTop: 28 }}>
        <a href="/contratos" className="back-link">← voltar aos contratos</a>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 14 }}>
          <div>
            <h1 className="page-title">{contract.supplierName}</h1>
            <p className="page-subtitle">{contract.area} · {contract.costCenter}</p>
          </div>
          <span className={`badge ${STATUS_BADGE[contract.status] ?? "badge-neutral"}`}>{contract.status}</span>
        </div>

        <section className="card section-gap">
          <h2 className="card-title">Detalhes</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", fontSize: 12.5 }}>
            <p style={{ margin: 0 }}><span className="text-muted">Gestor do contrato:</span> {contract.contractManager.name}</p>
            <p style={{ margin: 0 }}>
              <span className="text-muted">Solicitação de origem:</span>{" "}
              {contract.request ? <a href={`/solicitacoes/${contract.request.id}`} style={{ color: "var(--acerto-green-dark)", fontWeight: 600 }}>{contract.request.code}</a> : "—"}
            </p>
            <p style={{ margin: 0 }}><span className="text-muted">Início:</span> {formatDateOnly(contract.startDate)}</p>
            <p style={{ margin: 0 }}><span className="text-muted">Fim:</span> {formatDateOnly(contract.endDate)}</p>
            <p style={{ margin: 0 }}><span className="text-muted">Renovação prevista:</span> {formatDateOnly(contract.renewalDate)}</p>
          </div>
          {(contract.nonCompete || contract.lgpdClause || contract.brandUse || contract.corporateChangeClause) && (
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              {contract.nonCompete && <span className="badge badge-neutral">Não-concorrência</span>}
              {contract.lgpdClause && <span className="badge badge-neutral">LGPD</span>}
              {contract.brandUse && <span className="badge badge-neutral">Uso de marca</span>}
              {contract.corporateChangeClause && <span className="badge badge-neutral">Mudança societária</span>}
            </div>
          )}
          {contract.terminationClause && (
            <>
              <hr className="divider" />
              <p style={{ fontSize: 12.5, margin: 0 }}><span className="text-muted">Cláusula de rescisão:</span> {contract.terminationClause}</p>
            </>
          )}
        </section>

        <ContractActions contractId={contract.id} status={contract.status} />

        <section className="card section-gap">
          <h2 className="card-title">Alertas de renovação enviados</h2>
          {contract.alerts.length === 0 && <p style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Nenhum alerta enviado ainda.</p>}
          {contract.alerts.map((a) => (
            <div key={a.id} className="timeline-item">
              <span className="timeline-dot" />
              <span>{a.channel} · {new Date(a.sentAt).toLocaleString("pt-BR")}</span>
            </div>
          ))}
        </section>
      </main>
    </>
  );
}
