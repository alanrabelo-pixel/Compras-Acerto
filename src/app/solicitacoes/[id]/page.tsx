import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { STAGES } from "@/lib/workflow";
import { RequestActions } from "@/components/RequestActions";
import { AttachmentsPanel } from "@/components/AttachmentsPanel";
import { RequestChatWidget } from "@/components/RequestChatWidget";
import { formatDateOnly } from "@/lib/format";
import { TopNav } from "@/components/TopNav";

export const dynamic = "force-dynamic";

const PRIORITY_BADGE: Record<string, string> = {
  CRITICA: "badge-danger",
  ALTA: "badge-warning",
  MEDIA: "badge-info",
  BAIXA: "badge-neutral",
};

export default async function RequestDetailPage({ params }: { params: { id: string } }) {
  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: {
      requester: true,
      approverManager: true,
      buyer: true,
      costCenter: true,
      budgetException: true,
      dueDiligence: true,
      conflictDeclarations: { orderBy: { createdAt: "desc" } },
      quotes: { orderBy: { createdAt: "asc" } },
      approvals: { include: { approver: true } },
      legalReview: true,
      purchaseOrder: true,
      measurement: true,
      fiscalDocument: true,
      payment: true,
      contract: true,
      supplierEvaluation: true,
      attachments: { orderBy: { createdAt: "desc" } },
      stageEvents: { orderBy: { createdAt: "asc" }, include: { actor: true } },
      comments: { include: { author: true }, orderBy: { createdAt: "desc" } },
    },
  });

  if (!request) notFound();

  // Prisma Decimal não serializa através da fronteira Server → Client Component;
  // convertendo para number antes de passar para <RequestActions>.
  const serializableRequest = {
    ...request,
    estimatedValue: request.estimatedValue !== null ? Number(request.estimatedValue) : null,
    quotes: request.quotes.map((q) => ({
      ...q,
      initialValue: Number(q.initialValue),
      negotiatedValue: Number(q.negotiatedValue),
    })),
    purchaseOrder: request.purchaseOrder
      ? {
          ...request.purchaseOrder,
          initialValue: Number(request.purchaseOrder.initialValue),
          negotiatedValue: Number(request.purchaseOrder.negotiatedValue),
        }
      : null,
  };

  return (
    <>
      <TopNav active="/solicitacoes" />
      <main className="page" style={{ paddingTop: 28 }}>
        <a href="/solicitacoes" className="back-link">← voltar ao quadro</a>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 14 }}>
          <div>
            <h1 className="page-title">{request.shortDescription}</h1>
            <p className="page-subtitle">
              <span style={{ color: "var(--acerto-green-dark)", fontWeight: 700 }}>{request.code}</span> · {request.requester.name} · {request.costCenter.name}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className={`badge ${PRIORITY_BADGE[request.priority] ?? "badge-neutral"}`}>{request.priority}</span>
            <span className="badge badge-green">{STAGES[request.currentStage].label}</span>
          </div>
        </div>

        {request.fragmentationFlag && (
          <div
            className="section-gap"
            style={{ background: "var(--warning-bg)", border: "1px solid #fbdba0", borderRadius: 10, padding: 12, fontSize: 12.5, color: "var(--warning)" }}
          >
            ⚠ Sinalizada por risco de fracionamento — a soma das compras deste fornecedor nos últimos 12 meses ultrapassa a alçada individual desta solicitação. Revisão da Controladoria recomendada.
          </div>
        )}

        <section className="card section-gap">
          <h2 className="card-title">Detalhes</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", fontSize: 12.5 }}>
            <p style={{ margin: 0 }}>
              <span className="text-muted">Valor estimado:</span>{" "}
              {request.estimatedValue !== null ? `R$ ${Number(request.estimatedValue).toLocaleString("pt-BR")}` : "ainda não informado"}
            </p>
            <p style={{ margin: 0 }}><span className="text-muted">Tipo de demanda:</span> {request.demandType}</p>
            <p style={{ margin: 0 }}><span className="text-muted">Lane:</span> {request.lane ?? "não definida"}</p>
            <p style={{ margin: 0 }}><span className="text-muted">Gestor aprovador:</span> {request.approverManager.name}</p>
            <p style={{ margin: 0 }}><span className="text-muted">Comprador:</span> {request.buyer?.name ?? "não atribuído"}</p>
            <p style={{ margin: 0 }}><span className="text-muted">Aprovado pela liderança na abertura:</span> {request.leadershipPreApproved ? "Sim" : "Não"}</p>
            <p style={{ margin: 0 }}><span className="text-muted">Data limite sugerida (solicitante):</span> {formatDateOnly(request.suggestedDeadline)}</p>
          </div>
          <hr className="divider" />
          <p style={{ fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>{request.longDescription}</p>
          {request.indicatedSupplierName && (
            <p style={{ fontSize: 12.5, marginTop: 10 }}>
              <span className="text-muted">Fornecedor indicado:</span> {request.indicatedSupplierName}
              {request.indicatedSupplierPhone ? ` · ${request.indicatedSupplierPhone}` : ""}
              {request.indicatedSupplierEmail ? ` · ${request.indicatedSupplierEmail}` : ""}
              {request.indicatedSupplierWebsite ? ` · ${request.indicatedSupplierWebsite}` : ""}
            </p>
          )}
          {request.affectedUsers && (
            <p style={{ fontSize: 12.5, marginTop: 10 }}><span className="text-muted">Usuários afetados:</span> {request.affectedUsers}</p>
          )}
        </section>

        <RequestActions request={serializableRequest} />

        <AttachmentsPanel
          requestId={request.id}
          attachments={request.attachments.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }))}
          uploaderId={request.buyerId ?? request.requesterId}
        />

        <section className="card section-gap">
          <h2 className="card-title">Histórico</h2>
          {request.stageEvents.map((e) => (
            <div key={e.id} className="timeline-item">
              <span className="timeline-dot" />
              <span>
                {e.fromStage ? `${STAGES[e.fromStage].label} → ` : ""}
                <strong style={{ color: "var(--ink)" }}>{STAGES[e.toStage].label}</strong>
                {e.actor ? ` · ${e.actor.name}` : ""} · {new Date(e.createdAt).toLocaleString("pt-BR")}
                {e.comment ? ` — ${e.comment}` : ""}
              </span>
            </div>
          ))}
        </section>
      </main>

      <RequestChatWidget requestId={request.id} requesterName={request.requester.name} buyerName={request.buyer?.name ?? null} />
    </>
  );
}
