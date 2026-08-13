import { formatDateOnly, formatDateTime, formatCurrency as money } from "@/lib/format";
import type { Stage } from "@prisma/client";

function dateTime(d: Date | string | null | undefined) {
  if (!d) return null;
  return formatDateTime(d);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p style={{ margin: 0 }}>
      <span className="text-muted">{label}:</span> {children ?? "—"}
    </p>
  );
}

function Full({ children }: { children: React.ReactNode }) {
  return <div style={{ gridColumn: "1 / -1" }}>{children}</div>;
}

const APPROVAL_DECISION_LABEL: Record<string, string> = {
  PENDENTE: "Pendente",
  APROVADO: "Aprovado",
  REPROVADO: "Reprovado",
};

export type StageHistoryRequest = {
  code: string;
  shortDescription: string;
  longDescription: string;
  diretoria: string;
  costCenter: { name: string };
  priority: string;
  estimatedValue: number | null;
  demandType: string;
  quantity: number;
  lane: string | null;
  requester: { name: string; email: string };
  approverManager: { name: string; email: string } | null;
  buyer: { name: string } | null;
  managerApprovalDecision: string | null;
  managerApprovalActorId: string | null;
  managerApprovalJustification: string | null;
  managerApprovalDecidedAt: Date | null;
  budgetLine: { externalCode: string; description: string; monthRef: string } | null;
  budgetLineText: string | null;
  leadershipPreApproved: boolean;
  suggestedDeadline: Date;
  indicatedSupplierName: string | null;
  indicatedSupplierPhone: string | null;
  indicatedSupplierEmail: string | null;
  indicatedSupplierWebsite: string | null;
  affectedUsers: string | null;
  fragmentationFlag: boolean;
  valueType: string | null;
  needsContract: boolean | null;
  needsMapping: boolean | null;
  budgetException: {
    level: number; decision: string; justification: string | null; decidedAt: Date | null;
    attachment: { id: string; fileName: string } | null;
  } | null;
  dueDiligence: { approved: boolean | null; justification: string | null; decidedAt: Date | null } | null;
  conflictDeclarations: { id: string; declaredBy: string; hasConflict: boolean; details: string | null; createdAt: Date }[];
  quotes: {
    id: string; supplierName: string; initialValue: unknown; negotiatedValue: unknown;
    paymentCondition: string; currency: string; selected: boolean; createdAt: Date;
  }[];
  approvals: {
    id: string; level: number; decision: string; justification: string | null; personifiedBy: string | null;
    dueAt: Date | null; escalatedAt: Date | null; decidedAt: Date | null; approver: { name: string; email: string };
  }[];
  legalReview: { minutaUrl: string | null; signedDocUrl: string | null; signed: boolean | null; observations: string | null; decidedAt: Date | null } | null;
  purchaseOrder: {
    supplierLegalName: string; supplierCnpj: string; contactName: string; contactPhone: string; contactEmail: string;
    initialValue: unknown; negotiatedValue: unknown; paymentCondition: string; installments: number; installmentValue: unknown; currency: string;
    frete: string; prazoEntrega: string | null; localEntrega: string | null; sentToSupplier: boolean; needsMeasurement: boolean;
    pdfUrl: string | null; createdAt: Date;
    items: { id: string; descricao: string; quantidade: unknown; valorUnitario: unknown; impostosPercent: unknown; valorTotal: unknown }[];
  } | null;
  measurement: { scopeExecuted: string; quantities: string | null; contractRef: string | null; technicalApproval: string; reviewComment: string | null; decidedAt: Date | null } | null;
  fiscalDocument: { documentUrl: string; approved: boolean | null; reviewComment: string | null; decidedAt: Date | null } | null;
  payment: { scheduledDate: Date | null; paidDate: Date | null; status: string; erpConfirmed: boolean } | null;
  contract: { id: string; supplierName: string; status: string } | null;
  supplierEvaluation: { score: number | null; feedback: string | null; createdAt: Date } | null;
};

/**
 * Conteúdo (só os campos, sem título/rótulo de ator) do que foi preenchido em
 * uma etapa específica — usado dentro de cada linha expansível do Histórico
 * (ver HistoryTimeline.tsx). Mostra TODOS os campos de cada modelo (não um
 * resumo) — pedido explícito do usuário: o histórico precisa reproduzir o
 * formulário completo preenchido em cada etapa, não uma versão reduzida.
 * Retorna null quando a etapa não tem modelo de dados próprio (ex:
 * Aguardando Entrega) ou nada foi preenchido ainda.
 */
export function stageDataFields(
  stage: Stage,
  request: StageHistoryRequest,
  declaredByNames: Record<string, string> = {}
): React.ReactNode | null {
  const grid = (children: React.ReactNode) => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px", fontSize: 12.5 }}>{children}</div>
  );

  switch (stage) {
    case "SOLICITACAO":
      return grid(
        <>
          <Field label="Código">{request.code}</Field>
          <Field label="Solicitante">{request.requester.name} · {request.requester.email}</Field>
          <Field label="Diretoria">{request.diretoria}</Field>
          <Field label="Centro de Custo">{request.costCenter.name}</Field>
          <Field label="Prioridade">{request.priority}</Field>
          <Field label="Tipo de demanda">{request.demandType}</Field>
          <Field label="Quantidade">{request.quantity}</Field>
          <Field label="Valor estimado">{request.estimatedValue !== null ? money(request.estimatedValue) : "ainda não informado"}</Field>
          <Field label="Gestor aprovador">{request.approverManager ? `${request.approverManager.name} · ${request.approverManager.email}` : "sem gestor definido para este centro de custo"}</Field>
          <Field label="Linha do Orçamento">
            {request.budgetLine
              ? `${request.budgetLine.description} (${request.budgetLine.externalCode}) · ${request.budgetLine.monthRef}`
              : request.budgetLineText ?? "não informada"}
          </Field>
          <Field label="Aprovado pela liderança na abertura">{request.leadershipPreApproved ? "Sim" : "Não"}</Field>
          <Field label="Data limite sugerida">{formatDateOnly(request.suggestedDeadline)}</Field>
          <Full><Field label="Título">{request.shortDescription}</Field></Full>
          <Full><Field label="Descrição completa">{request.longDescription}</Field></Full>
          {request.indicatedSupplierName && (
            <Full>
              <Field label="Fornecedor indicado">
                {request.indicatedSupplierName}
                {request.indicatedSupplierPhone ? ` · ${request.indicatedSupplierPhone}` : ""}
                {request.indicatedSupplierEmail ? ` · ${request.indicatedSupplierEmail}` : ""}
                {request.indicatedSupplierWebsite ? ` · ${request.indicatedSupplierWebsite}` : ""}
              </Field>
            </Full>
          )}
          {request.affectedUsers && <Full><Field label="Usuários afetados">{request.affectedUsers}</Field></Full>}
        </>
      );

    case "APROVACAO_GESTOR":
      if (!request.managerApprovalDecision) return null;
      return grid(
        <>
          <Field label="Decisão">{APPROVAL_DECISION_LABEL[request.managerApprovalDecision] ?? request.managerApprovalDecision}</Field>
          <Field label="Decidido por">{request.managerApprovalActorId ? (declaredByNames[request.managerApprovalActorId] ?? request.managerApprovalActorId) : "—"}</Field>
          <Field label="Decidido em">{dateTime(request.managerApprovalDecidedAt) ?? "—"}</Field>
          <Full><Field label="Justificativa">{request.managerApprovalJustification ?? "—"}</Field></Full>
        </>
      );

    case "TRIAGEM":
      if (request.valueType === null && request.needsContract === null && request.needsMapping === null) return null;
      return grid(
        <>
          <Field label="Tipo de valor">{request.valueType ?? "—"}</Field>
          <Field label="Lane calculada">{request.lane ?? "—"}</Field>
          <Field label="Precisa de contrato">{request.needsContract === null ? "—" : request.needsContract ? "Sim" : "Não"}</Field>
          <Field label="Precisa de mapeamento">{request.needsMapping === null ? "—" : request.needsMapping ? "Sim" : "Não"}</Field>
          <Field label="Risco de fracionamento">{request.fragmentationFlag ? "Sinalizado" : "Não sinalizado"}</Field>
        </>
      );

    case "VALIDACAO_ORCAMENTARIA":
      if (!request.budgetException) return null;
      return grid(
        <>
          <Field label="Alçada">Nível {request.budgetException.level}</Field>
          <Field label="Decisão">{APPROVAL_DECISION_LABEL[request.budgetException.decision] ?? request.budgetException.decision}</Field>
          <Field label="Decidido em">{dateTime(request.budgetException.decidedAt) ?? "—"}</Field>
          <Field label="Anexo de aprovação extra-orçamentária">
            {request.budgetException.attachment ? (
              <a href={`/api/attachments/${request.budgetException.attachment.id}/file`} target="_blank" rel="noreferrer" style={{ color: "var(--acerto-green-dark)", fontWeight: 600 }}>
                {request.budgetException.attachment.fileName}
              </a>
            ) : "—"}
          </Field>
          <Full><Field label="Justificativa">{request.budgetException.justification ?? "—"}</Field></Full>
        </>
      );

    case "DUE_DILIGENCE":
      if (!request.dueDiligence) return null;
      return grid(
        <>
          <Field label="Aprovado">{request.dueDiligence.approved === null ? "—" : request.dueDiligence.approved ? "Sim" : "Não"}</Field>
          <Field label="Decidido em">{dateTime(request.dueDiligence.decidedAt) ?? "—"}</Field>
          <Full><Field label="Justificativa">{request.dueDiligence.justification ?? "—"}</Field></Full>
        </>
      );

    case "COTACAO":
    case "MAPA_COTACAO": {
      if (request.quotes.length === 0 && request.conflictDeclarations.length === 0) return null;
      return grid(
        <>
          {request.quotes.map((q) => (
            <Full key={q.id}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--surface-muted)" }}>
                <span>{q.selected && <strong style={{ color: "var(--acerto-green-dark)" }}>✓ </strong>}{q.supplierName} · {q.paymentCondition} · {q.currency} · {formatDateOnly(q.createdAt)}</span>
                <span>{money(q.initialValue as number)} → <strong>{money(q.negotiatedValue as number)}</strong></span>
              </div>
            </Full>
          ))}
          {request.conflictDeclarations.map((c) => (
            <Full key={c.id}>
              <Field label={`Conflito de interesse — ${declaredByNames[c.declaredBy] ?? c.declaredBy}`}>
                {c.hasConflict ? "Declarou conflito" : "Sem conflito"}{c.details ? ` — ${c.details}` : ""} · {formatDateOnly(c.createdAt)}
              </Field>
            </Full>
          ))}
        </>
      );
    }

    case "APROVACAO":
      if (request.approvals.length === 0) return null;
      return grid(
        <>
          {request.approvals.map((a) => (
            <Full key={a.id}>
              <Field label={`Nível ${a.level} — ${a.approver.name} (${a.approver.email})`}>
                {APPROVAL_DECISION_LABEL[a.decision] ?? a.decision}
                {a.personifiedBy ? ` · personificado por ${a.personifiedBy}` : ""}
                {a.justification ? ` — ${a.justification}` : ""}
                {a.dueAt ? ` · prazo: ${dateTime(a.dueAt)}` : ""}
                {a.escalatedAt ? ` · escalonado em ${dateTime(a.escalatedAt)}` : ""}
                {a.decidedAt ? ` · decidido em ${dateTime(a.decidedAt)}` : ""}
              </Field>
            </Full>
          ))}
        </>
      );

    case "JURIDICO":
      if (!request.legalReview) return null;
      return grid(
        <>
          <Field label="Assinado">{request.legalReview.signed === null ? "—" : request.legalReview.signed ? "Sim" : "Não"}</Field>
          <Field label="Decidido em">{dateTime(request.legalReview.decidedAt) ?? "—"}</Field>
          <Field label="Minuta">
            {request.legalReview.minutaUrl ? <a href={request.legalReview.minutaUrl} target="_blank" rel="noreferrer" style={{ color: "var(--acerto-green-dark)", fontWeight: 600 }}>Abrir →</a> : "—"}
          </Field>
          <Field label="Documento assinado">
            {request.legalReview.signedDocUrl ? <a href={request.legalReview.signedDocUrl} target="_blank" rel="noreferrer" style={{ color: "var(--acerto-green-dark)", fontWeight: 600 }}>Abrir →</a> : "—"}
          </Field>
          <Full><Field label="Observações">{request.legalReview.observations ?? "—"}</Field></Full>
        </>
      );

    case "PEDIDO_COMPRA":
      if (!request.purchaseOrder) return null;
      return grid(
        <>
          <Field label="Fornecedor">{request.purchaseOrder.supplierLegalName} · {request.purchaseOrder.supplierCnpj}</Field>
          <Field label="Contato">{request.purchaseOrder.contactName} · {request.purchaseOrder.contactPhone} · {request.purchaseOrder.contactEmail}</Field>
          <Field label="Valor">{money(request.purchaseOrder.initialValue as number)} → <strong>{money(request.purchaseOrder.negotiatedValue as number)}</strong> ({request.purchaseOrder.currency})</Field>
          {(() => {
            const initial = Number(request.purchaseOrder!.initialValue);
            const negotiated = Number(request.purchaseOrder!.negotiatedValue);
            const savingValue = initial - negotiated;
            const savingPct = initial > 0 ? (savingValue / initial) * 100 : 0;
            return (
              <Field label="Saving desta compra">
                <strong style={{ color: savingValue >= 0 ? "var(--acerto-green-dark)" : "var(--danger)" }}>
                  {money(savingValue)} ({savingPct.toFixed(1)}%)
                </strong>
              </Field>
            );
          })()}
          <Field label="Condição de Pagamento">{request.purchaseOrder.paymentCondition}</Field>
          <Field label="Número de Parcelas">{request.purchaseOrder.installments}x</Field>
          <Field label="Valor da Parcela">{request.purchaseOrder.installmentValue !== null ? money(request.purchaseOrder.installmentValue as number) : "—"}</Field>
          <Field label="Frete">{request.purchaseOrder.frete}</Field>
          <Field label="Prazo de Entrega">{request.purchaseOrder.prazoEntrega ?? "—"}</Field>
          <Field label="Enviado ao fornecedor">{request.purchaseOrder.sentToSupplier ? "Sim" : "Não"}</Field>
          <Field label="Precisa de medição">{request.purchaseOrder.needsMeasurement ? "Sim" : "Não"}</Field>
          <Field label="Emitido em">{dateTime(request.purchaseOrder.createdAt)}</Field>
          <Full><Field label="Local de Entrega">{request.purchaseOrder.localEntrega ?? "—"}</Field></Full>
          {request.purchaseOrder.items.length > 0 && (
            <Full>
              <p style={{ margin: "4px 0", fontWeight: 600 }}>Itens:</p>
              {request.purchaseOrder.items.map((it) => (
                <div key={it.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", borderBottom: "1px solid var(--surface-muted)" }}>
                  <span>{it.descricao} × {Number(it.quantidade)} · unit. {money(it.valorUnitario as number)} · impostos {Number(it.impostosPercent)}%</span>
                  <span>{money(it.valorTotal as number)}</span>
                </div>
              ))}
            </Full>
          )}
          {request.purchaseOrder.pdfUrl && (
            <Full>
              <a href={request.purchaseOrder.pdfUrl} target="_blank" rel="noreferrer" style={{ color: "var(--acerto-green-dark)", fontWeight: 600 }}>Baixar PDF do Pedido de Compra →</a>
            </Full>
          )}
        </>
      );

    case "MEDICAO":
      if (!request.measurement) return null;
      return grid(
        <>
          <Field label="Aprovação técnica">{APPROVAL_DECISION_LABEL[request.measurement.technicalApproval] ?? request.measurement.technicalApproval}</Field>
          <Field label="Referência de contrato">{request.measurement.contractRef ?? "—"}</Field>
          <Field label="Quantidades">{request.measurement.quantities ?? "—"}</Field>
          <Field label="Decidido em">{dateTime(request.measurement.decidedAt) ?? "—"}</Field>
          <Full><Field label="Escopo executado">{request.measurement.scopeExecuted}</Field></Full>
          <Full><Field label="Comentário da revisão">{request.measurement.reviewComment ?? "—"}</Field></Full>
        </>
      );

    case "FISCAL":
      if (!request.fiscalDocument) return null;
      return grid(
        <>
          <Field label="Aprovado">{request.fiscalDocument.approved === null ? "—" : request.fiscalDocument.approved ? "Sim" : "Não"}</Field>
          <Field label="Decidido em">{dateTime(request.fiscalDocument.decidedAt) ?? "—"}</Field>
          <Field label="Documento">
            <a href={request.fiscalDocument.documentUrl} target="_blank" rel="noreferrer" style={{ color: "var(--acerto-green-dark)", fontWeight: 600 }}>Abrir →</a>
          </Field>
          <Full><Field label="Comentário">{request.fiscalDocument.reviewComment ?? "—"}</Field></Full>
        </>
      );

    case "TESOURARIA":
      if (!request.payment) return null;
      return grid(
        <>
          <Field label="Status">{request.payment.status}</Field>
          <Field label="Confirmado no ERP">{request.payment.erpConfirmed ? "Sim" : "Não"}</Field>
          <Field label="Data programada">{request.payment.scheduledDate ? formatDateOnly(request.payment.scheduledDate) : "—"}</Field>
          <Field label="Data de pagamento">{request.payment.paidDate ? formatDateOnly(request.payment.paidDate) : "—"}</Field>
        </>
      );

    case "MAPEAMENTO_CONTRATO":
      if (!request.contract) return null;
      return grid(
        <>
          <Field label="Fornecedor">{request.contract.supplierName}</Field>
          <Field label="Status">{request.contract.status}</Field>
          <Full><a href={`/contratos/${request.contract.id}`} style={{ color: "var(--acerto-green-dark)", fontWeight: 600 }}>Ver contrato completo (19 campos) →</a></Full>
        </>
      );

    case "CONCLUIDO":
      if (!request.supplierEvaluation) return null;
      return grid(
        <>
          <Field label="Nota (NPS)">{request.supplierEvaluation.score ?? "—"}</Field>
          <Field label="Avaliado em">{dateTime(request.supplierEvaluation.createdAt)}</Field>
          <Full><Field label="Comentário">{request.supplierEvaluation.feedback ?? "—"}</Field></Full>
        </>
      );

    default:
      return null;
  }
}
