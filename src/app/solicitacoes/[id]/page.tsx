import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { STAGES } from "@/lib/workflow";
import { RequestActions } from "@/components/RequestActions";
import { AttachmentsPanel } from "@/components/AttachmentsPanel";
import { RequestChatWidget } from "@/components/RequestChatWidget";
import { HistoryTimeline } from "@/components/HistoryTimeline";
import { StageOverrideControls } from "@/components/StageOverrideControls";
import { formatDateOnly } from "@/lib/format";
import { AppShell } from "@/components/AppShell";
import { Breadcrumb, Badge } from "@/components/ui";
import { AlertTriangle } from "lucide-react";
import { PRIORITY_BADGE_VARIANT } from "@/lib/badge-variants";

export const dynamic = "force-dynamic";

export default async function RequestDetailPage({ params }: { params: { id: string } }) {
  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: {
      requester: true,
      approverManager: true,
      buyer: true,
      costCenter: true,
      budgetLine: true,
      budgetException: { include: { attachment: true } },
      dueDiligence: true,
      conflictDeclarations: { orderBy: { createdAt: "desc" } },
      quotes: { orderBy: { createdAt: "asc" } },
      approvals: { include: { approver: true } },
      legalReview: true,
      purchaseOrder: { include: { items: { orderBy: { order: "asc" } } } },
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

  // Identidade de quem está logado (mesmo padrão de solicitacoes/nova/page.tsx)
  // — repassada para RequestActions para autopreencher/travar os campos de
  // "responsável" em cada etapa quando o SSO real estiver ligado. Sem sessão
  // real (LOCAL_BYPASS_AUTH, ver .env), fica null e os seletores manuais
  // continuam aparecendo, como antes.
  const session = await getServerSession(authOptions);
  const sessionActor = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, name: true, email: true },
      })
    : null;

  // ConflictOfInterestDeclaration.declaredBy guarda o id do usuário (via
  // UserPicker em RequestActions), sem relação FK no schema — resolvendo o
  // nome aqui para exibição no Histórico, em vez do id cru.
  const declaredByUsers = request.conflictDeclarations.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: request.conflictDeclarations.map((c) => c.declaredBy) } },
      })
    : [];
  const declaredByNames = Object.fromEntries(declaredByUsers.map((u) => [u.id, u.name]));

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
    <AppShell active="/solicitacoes">
      <main className="page" style={{ paddingTop: 28 }}>
        <Breadcrumb items={[{ label: "Quadro", href: "/solicitacoes" }, { label: request.code }]} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 14 }}>
          <div>
            <h1 className="page-title">{request.shortDescription}</h1>
            <p className="page-subtitle">
              <span style={{ color: "var(--acerto-green-dark)", fontWeight: 700 }}>{request.code}</span> · {request.requester.name} · {request.costCenter.name}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Badge variant={PRIORITY_BADGE_VARIANT[request.priority] ?? "neutral"}>{request.priority}</Badge>
            <Badge variant="green">{STAGES[request.currentStage].label}</Badge>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <StageOverrideControls
            requestId={request.id}
            currentStageLabel={STAGES[request.currentStage].label}
            allStageOptions={Object.values(STAGES)
              .filter((s) => s.stage !== request.currentStage)
              .map((s) => ({ value: s.stage, label: s.label }))}
          />
        </div>

        {request.fragmentationFlag && (
          <div
            className="section-gap"
            style={{ display: "flex", gap: 8, background: "var(--warning-bg)", border: "1px solid #fbdba0", borderRadius: 10, padding: 12, fontSize: 12.5, color: "var(--warning)" }}
          >
            <AlertTriangle size={15} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
            <span>Sinalizada por risco de fracionamento — a soma das compras deste fornecedor nos últimos 12 meses ultrapassa a alçada individual desta solicitação. Revisão da Controladoria recomendada.</span>
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
            <p style={{ margin: 0 }}><span className="text-muted">Quantidade:</span> {request.quantity}</p>
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

        <RequestActions request={serializableRequest} sessionActor={sessionActor} />

        <AttachmentsPanel
          requestId={request.id}
          attachments={request.attachments.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }))}
          uploaderId={request.buyerId ?? request.requesterId}
        />

        <HistoryTimeline stageEvents={request.stageEvents} request={serializableRequest} declaredByNames={declaredByNames} />
      </main>

      <RequestChatWidget requestId={request.id} requesterName={request.requester.name} buyerName={request.buyer?.name ?? null} />
    </AppShell>
  );
}
