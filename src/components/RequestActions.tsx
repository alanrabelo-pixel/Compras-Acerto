"use client";

import { useState, useEffect, useId } from "react";
import { useRouter } from "next/navigation";
import type { RoleName } from "@prisma/client";
import { UserPicker } from "@/components/UserPicker";
import { SupplierPicker } from "@/components/SupplierPicker";
import { AiInsightPanel } from "@/components/AiInsightPanel";
import { budgetExceptionLevel, budgetExceptionApproverRole, BUDGET_EXCEPTION_LEVEL_LABEL } from "@/lib/workflow";
import { Button, Card } from "@/components/ui";

// Identidade de quem está logado (server session — ver src/lib/auth.ts),
// repassada de solicitacoes/[id]/page.tsx. Com SSO real ligado, o servidor
// (requireRole em src/lib/rbac.ts) exige que o "ator" de cada ação bata com
// quem está de fato autenticado — então, quando sessionActor existe, os
// campos de "responsável" abaixo são preenchidos com a própria pessoa
// logada e o seletor manual é ocultado (não faz sentido deixar escolher
// outra pessoa que o servidor vai rejeitar). Sem sessão real
// (LOCAL_BYPASS_AUTH, ver .env), sessionActor é null e o seletor manual
// volta a aparecer, como antes.
type SessionActor = { id: string; name: string; email: string } | null;

// Estado do "ator" de uma ação: quando há sessão real, é sempre o próprio
// usuário logado (ignora qualquer seleção manual); sem sessão, é um estado
// local comum, editável via o UserPicker.
function useActorId(sessionActor: SessionActor, initial = "") {
  const [manual, setManual] = useState(initial);
  return [sessionActor?.id ?? manual, setManual] as const;
}

// Campo de "responsável pela ação": com sessão real, mostra só o nome de
// quem está logado (somente leitura); sem sessão, mostra o UserPicker manual
// de sempre.
function ActorField({
  label, sessionActor, value, onChange, role, placeholder,
}: {
  label: string;
  sessionActor: SessionActor;
  value: string;
  onChange: (userId: string) => void;
  role?: RoleName;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      {sessionActor ? (
        <p id={id} style={{ fontSize: 12.5, margin: "4px 0 0" }}>
          {sessionActor.name} <span style={{ color: "var(--ink-muted)" }}>({sessionActor.email})</span>
        </p>
      ) : (
        <UserPicker id={id} value={value} onChange={onChange} role={role} placeholder={placeholder} />
      )}
    </div>
  );
}

type Quote = {
  id: string;
  supplierName: string;
  initialValue: number;
  negotiatedValue: number;
  paymentCondition: string;
  currency: string;
  selected: boolean;
};

type RequestData = {
  id: string;
  currentStage: string;
  estimatedValue: number | null;
  requesterId: string;
  buyerId?: string | null;
  approverManager: { name: string; email: string } | null;
  demandType: string;
  shortDescription: string;
  longDescription: string;
  needsContract?: boolean | null;
  needsMapping?: boolean | null;
  conflictDeclarations: { id: string; hasConflict: boolean; declaredBy: string; details: string | null; createdAt: Date }[];
  approvals: { id: string; level: number; decision: string; approver: { name: string } }[];
  quotes: Quote[];
  purchaseOrder: { id: string; needsMeasurement: boolean; pdfUrl?: string | null; paymentCondition?: string } | null;
  contract: { id: string } | null;
  supplierEvaluation: { id: string } | null;
};

type Submit = (url: string, method: string, body: unknown) => void;

export function RequestActions({
  request, sessionActor = null, declaredByNames = {},
}: { request: RequestData; sessionActor?: SessionActor; declaredByNames?: Record<string, string> }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, method: string, body: unknown) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao processar ação.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  switch (request.currentStage) {
    case "APROVACAO_GESTOR":
      return <AprovacaoGestorForm request={request} onSubmit={call} loading={loading} error={error} sessionActor={sessionActor} />;
    case "TRIAGEM":
      return <TriagemForm request={request} onSubmit={call} loading={loading} error={error} sessionActor={sessionActor} />;
    case "VALIDACAO_ORCAMENTARIA":
      return <ValidacaoForm request={request} onSubmit={call} loading={loading} error={error} sessionActor={sessionActor} />;
    case "DUE_DILIGENCE":
      return <DueDiligenceForm request={request} onSubmit={call} loading={loading} error={error} sessionActor={sessionActor} />;
    case "COTACAO":
      return <CotacaoForm request={request} onSubmit={call} loading={loading} error={error} sessionActor={sessionActor} />;
    case "MAPA_COTACAO":
      return <MapaCotacaoForm request={request} onSubmit={call} loading={loading} error={error} sessionActor={sessionActor} />;
    case "APROVACAO":
      return <AprovacaoForm request={request} onSubmit={call} loading={loading} error={error} sessionActor={sessionActor} declaredByNames={declaredByNames} />;
    case "JURIDICO":
      return <JuridicoForm request={request} onSubmit={call} loading={loading} error={error} sessionActor={sessionActor} />;
    case "PEDIDO_COMPRA":
      return <PedidoCompraForm request={request} onSubmit={call} loading={loading} error={error} sessionActor={sessionActor} />;
    case "AGUARDANDO_ENTREGA":
      return <AguardandoEntregaForm request={request} onSubmit={call} loading={loading} error={error} sessionActor={sessionActor} />;
    case "MEDICAO":
      return <MedicaoForm request={request} onSubmit={call} loading={loading} error={error} sessionActor={sessionActor} />;
    case "FISCAL":
      return <FiscalForm request={request} onSubmit={call} loading={loading} error={error} sessionActor={sessionActor} />;
    case "TESOURARIA":
      return <TesourariaForm request={request} onSubmit={call} loading={loading} error={error} sessionActor={sessionActor} />;
    case "MAPEAMENTO_CONTRATO":
      return <MapeamentoContratoForm request={request} onSubmit={call} loading={loading} error={error} sessionActor={sessionActor} />;
    case "CONCLUIDO":
      return <ConcluidoPanel request={request} onSubmit={call} loading={loading} error={error} />;
    default:
      return (
        <section className="card section-gap" style={{ background: "var(--surface-muted)", fontSize: 12.5, color: "var(--ink-muted)" }}>
          Sem ação disponível nesta tela para a etapa atual ({request.currentStage}).
        </section>
      );
  }
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card title={title} accent className="section-gap">
      {children}
    </Card>
  );
}

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 8 }}>{error}</p>;
}

function TriagemForm({
  request, onSubmit, loading, error, sessionActor,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null; sessionActor: SessionActor }) {
  const [buyerId, setBuyerId] = useActorId(sessionActor);
  const [needsContract, setNeedsContract] = useState(false);
  const [needsMapping, setNeedsMapping] = useState(false);
  const [valueType, setValueType] = useState("FIXO");
  const [supplierApproved, setSupplierApproved] = useState(false);
  const [supplierRiskTier, setSupplierRiskTier] = useState("MEDIO");
  const [handlesPersonalData, setHandlesPersonalData] = useState(request.demandType === "FERRAMENTA_NOVA");
  const [priorValue, setPriorValue] = useState(0);
  const [priorValueSource, setPriorValueSource] = useState<{ matchType: string; matchedSupplierName: string | null } | null>(null);
  const [estimatedValue, setEstimatedValue] = useState(0);
  const needsEstimatedValue = request.estimatedValue === null;
  const isCancelamento = request.demandType === "CANCELAMENTO";

  // Antes, este número era digitado de memória pelo comprador — agora vem
  // pré-calculado a partir do histórico real de Pedidos de Compra (ver
  // /api/requests/[id]/supplier-history), continuando editável porque a
  // correspondência por nome de fornecedor pode não ser exata.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/requests/${request.id}/supplier-history`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setPriorValue(data.sum ?? 0);
        setPriorValueSource({ matchType: data.matchType, matchedSupplierName: data.matchedSupplierName });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [request.id]);

  if (isCancelamento) {
    return (
      <Panel title="Triagem">
        <div style={{ display: "grid", gap: 10 }}>
          <p className="hint-box hint-box-warning">
            Cancelamento de Contrato, Serviços e Ferramentas — fluxo simplificado: pula Validação Orçamentária,
            Cotação, Aprovação e Pedido de Compra, e vai direto para Jurídico formalizar o distrato/termo de
            cancelamento. Depois de assinado, a solicitação é encerrada direto (o contrato já existe e já está
            mapeado — cancelá-lo de fato é feito em Contratos).
          </p>
          <div className="form-section">
            <ActorField
              label="Comprador responsável"
              sessionActor={sessionActor} value={buyerId} onChange={setBuyerId}
              role="COMPRADOR" placeholder="Selecione o comprador"
            />
          </div>
          <ErrorBox error={error} />
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              variant="primary"
              disabled={loading || !buyerId}
              onClick={() => onSubmit(`/api/requests/${request.id}/triagem`, "PATCH", { buyerId, action: "AVANCAR" })}
            >
              Avançar direto para Jurídico (Cancelamento)
            </Button>
            <Button
              variant="secondary"
              disabled={loading || !buyerId}
              onClick={() => onSubmit(`/api/requests/${request.id}/triagem`, "PATCH", { buyerId, action: "DEVOLVER", returnReason: "Informações incompletas — favor detalhar." })}
            >
              Devolver ao solicitante
            </Button>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Triagem">
      <div style={{ display: "grid", gap: 10 }}>
        <div className="form-section">
          <ActorField
            label="Comprador responsável (não pode ser o solicitante)"
            sessionActor={sessionActor} value={buyerId} onChange={setBuyerId}
            role="COMPRADOR" placeholder="Selecione o comprador"
          />
        </div>

        <AiInsightPanel
          requestId={request.id}
          stage="TRIAGEM"
          actorId={buyerId}
          draft={{ supplierApproved, supplierRiskTier, handlesPersonalData }}
        />

        <div className="form-section">
          <p className="form-section-label">Valor e risco</p>
          {needsEstimatedValue && (
            <div className="hint-box hint-box-warning">
              <label className="label" htmlFor="triagem-estimated-value">
                Esta solicitação foi aberta sem valor estimado — preencha antes de avançar (necessário para calcular alçada/lane)
              </label>
              <input id="triagem-estimated-value" className="input" type="number" value={estimatedValue} onChange={(e) => setEstimatedValue(Number(e.target.value))} />
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label className="label" htmlFor="triagem-value-type">Tipo de valor</label>
              <select id="triagem-value-type" className="input" value={valueType} onChange={(e) => setValueType(e.target.value)}>
                <option value="FIXO">Fixo</option>
                <option value="VARIAVEL">Variável</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="triagem-supplier-risk">Risco do fornecedor</label>
              <select id="triagem-supplier-risk" className="input" value={supplierRiskTier} onChange={(e) => setSupplierRiskTier(e.target.value)}>
                <option value="BAIXO">Baixo</option>
                <option value="MEDIO">Médio</option>
                <option value="ALTO">Alto</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="triagem-prior-value">Soma de compras deste fornecedor nos últimos 12 meses (R$)</label>
            <input id="triagem-prior-value" className="input" type="number" value={priorValue} onChange={(e) => setPriorValue(Number(e.target.value))} />
            {priorValueSource && priorValueSource.matchType !== "none" && (
              <p className="help" style={{ marginTop: 4 }}>
                Calculado automaticamente a partir de Pedidos de Compra de {priorValueSource.matchedSupplierName}
                {priorValueSource.matchType === "approximate" ? " (correspondência aproximada pelo nome — confira antes de avançar)" : ""}.
              </p>
            )}
            {priorValueSource && priorValueSource.matchType === "none" && (
              <p className="help" style={{ marginTop: 4 }}>Nenhum histórico encontrado para este fornecedor — ajuste se souber de compras anteriores.</p>
            )}
          </div>
        </div>

        <div className="form-section">
          <p className="form-section-label">Contrato e fornecedor</p>
          <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
            <label><input type="checkbox" checked={needsContract} onChange={(e) => setNeedsContract(e.target.checked)} /> Precisa de contrato</label>
            <label><input type="checkbox" checked={needsMapping} onChange={(e) => setNeedsMapping(e.target.checked)} /> Precisa de mapeamento</label>
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
            <label><input type="checkbox" checked={supplierApproved} onChange={(e) => setSupplierApproved(e.target.checked)} /> Fornecedor já homologado</label>
            <label><input type="checkbox" checked={handlesPersonalData} onChange={(e) => setHandlesPersonalData(e.target.checked)} /> Trata dado pessoal</label>
          </div>
        </div>
        <ErrorBox error={error} />
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            variant="primary"
            disabled={loading || !buyerId || (needsEstimatedValue && estimatedValue <= 0)}
            onClick={() =>
              onSubmit(`/api/requests/${request.id}/triagem`, "PATCH", {
                buyerId, action: "AVANCAR", needsContract, needsMapping, valueType,
                supplierApproved, supplierRiskTier, handlesPersonalData,
                priorRequestsValueLast12Months: priorValue,
                ...(needsEstimatedValue ? { estimatedValue } : {}),
              })
            }
          >
            Avançar para Validação Orçamentária
          </Button>
          <Button
            variant="secondary"
            disabled={loading || !buyerId}
            onClick={() => onSubmit(`/api/requests/${request.id}/triagem`, "PATCH", { buyerId, action: "DEVOLVER", returnReason: "Informações incompletas — favor detalhar." })}
          >
            Devolver ao solicitante
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function ValidacaoForm({
  request, onSubmit, loading, error, sessionActor,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null; sessionActor: SessionActor }) {
  const [justification, setJustification] = useState("");
  const [exceptionApproverId, setExceptionApproverId] = useActorId(sessionActor);
  const [budgetActorId, setBudgetActorId] = useActorId(sessionActor, request.buyerId ?? "");
  const [budgetObservation, setBudgetObservation] = useState("");

  // Alçada da exceção calculada pelo valor estimado — define qual papel pode
  // decidir (Coordenação no Nível 1, Gerente F&NC nos Níveis 2 e 3).
  const exceptionLevel = budgetExceptionLevel(request.estimatedValue ?? 0);
  const exceptionApproverRole = budgetExceptionApproverRole(exceptionLevel);

  return (
    <Panel title="Validação orçamentária">
      <div style={{ display: "grid", gap: 10 }}>
        <div className="form-section">
          <p className="form-section-label">Validação</p>
          <ActorField label="Responsável pela validação" sessionActor={sessionActor} value={budgetActorId} onChange={setBudgetActorId} role="COMPRADOR" />
          <div>
            <label className="label" htmlFor="validacao-budget-observation">Linha do Orçamento (observação)</label>
            <input
              id="validacao-budget-observation"
              className="input" value={budgetObservation} onChange={(e) => setBudgetObservation(e.target.value)}
              placeholder="Ex: Linha Marketing Digital, dentro do previsto para o mês"
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              variant="primary"
              disabled={loading || !budgetActorId}
              onClick={() =>
                onSubmit(`/api/requests/${request.id}/validacao-orcamentaria`, "PATCH", {
                  budgetOk: true, actorId: budgetActorId, observation: budgetObservation,
                })
              }
            >
              Há orçamento disponível
            </Button>
            <Button
              variant="secondary"
              disabled={loading}
              onClick={() => onSubmit(`/api/requests/${request.id}/validacao-orcamentaria`, "PATCH", { budgetOk: false })}
            >
              Sem orçamento — abrir exceção
            </Button>
          </div>
        </div>
        <div className="form-section">
          <p className="form-section-label">Exceção orçamentária</p>
          <p style={{ fontSize: 11, color: "var(--ink-muted)", marginBottom: 8 }}>
            Se uma exceção já foi aberta, decida abaixo — alçada calculada: <strong>{BUDGET_EXCEPTION_LEVEL_LABEL[exceptionLevel]}</strong>
          </p>
          <ActorField
            label={`Aprovador da exceção (${exceptionApproverRole})`}
            sessionActor={sessionActor} value={exceptionApproverId} onChange={setExceptionApproverId}
            role={exceptionApproverRole} placeholder="Selecione o aprovador da exceção"
          />
          <div>
            <label className="label" htmlFor="validacao-exception-justification">Justificativa</label>
            <input id="validacao-exception-justification" className="input" value={justification} onChange={(e) => setJustification(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              variant="primary"
              disabled={loading}
              onClick={() =>
                onSubmit(`/api/requests/${request.id}/validacao-orcamentaria`, "PATCH", {
                  budgetOk: false, exceptionDecision: "APROVADO", exceptionApproverId, justification,
                })
              }
            >
              Aprovar exceção
            </Button>
            <Button
              variant="secondary"
              disabled={loading}
              onClick={() =>
                onSubmit(`/api/requests/${request.id}/validacao-orcamentaria`, "PATCH", {
                  budgetOk: false, exceptionDecision: "REPROVADO", exceptionApproverId, justification,
                })
              }
            >
              Reprovar exceção
            </Button>
          </div>
        </div>
        <ErrorBox error={error} />
      </div>
    </Panel>
  );
}

function DueDiligenceForm({
  request, onSubmit, loading, error, sessionActor,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null; sessionActor: SessionActor }) {
  const [decidedBy, setDecidedBy] = useActorId(sessionActor);
  const [justification, setJustification] = useState("");

  return (
    <Panel title="Due Diligence (Privacidade)">
      <div style={{ display: "grid", gap: 10 }}>
        <div className="form-section">
          <ActorField label="Responsável (Privacidade)" sessionActor={sessionActor} value={decidedBy} onChange={setDecidedBy} role="PRIVACIDADE" />
        </div>
        <AiInsightPanel requestId={request.id} stage="DUE_DILIGENCE" actorId={decidedBy} />
        <div className="form-section">
          <p className="form-section-label">Decisão</p>
          <div>
            <label className="label" htmlFor="due-diligence-justification">Justificativa</label>
            <input id="due-diligence-justification" className="input" value={justification} onChange={(e) => setJustification(e.target.value)} />
          </div>
        </div>
        <ErrorBox error={error} />
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="primary" disabled={loading || !decidedBy} onClick={() => onSubmit(`/api/requests/${request.id}/due-diligence`, "PATCH", { decidedBy, approved: true, justification })}>
            Aprovar
          </Button>
          <Button variant="danger" disabled={loading || !decidedBy} onClick={() => onSubmit(`/api/requests/${request.id}/due-diligence`, "PATCH", { decidedBy, approved: false, justification })}>
            Reprovar
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function CotacaoForm({
  request, onSubmit, loading, error, sessionActor,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null; sessionActor: SessionActor }) {
  const [actorId, setActorId] = useActorId(sessionActor, request.buyerId ?? "");
  const [supplierName, setSupplierName] = useState("");
  const [initialValue, setInitialValue] = useState(0);
  const [negotiatedValue, setNegotiatedValue] = useState(0);
  const [paymentCondition, setPaymentCondition] = useState("");

  return (
    <Panel title="Cotação">
      <div style={{ display: "grid", gap: 10 }}>
        {request.quotes.length > 0 && (
          <div className="form-section">
            <p className="form-section-label">Cotações registradas</p>
            <div style={{ fontSize: 12 }}>
              {request.quotes.map((q) => (
                <div key={q.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--border-soft)" }}>
                  <strong>{q.supplierName}</strong> — R$ {q.negotiatedValue.toLocaleString("pt-BR")} ({q.paymentCondition})
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="form-section">
          <ActorField label="Comprador responsável" sessionActor={sessionActor} value={actorId} onChange={setActorId} role="COMPRADOR" />
        </div>
        <AiInsightPanel requestId={request.id} stage="COTACAO" actorId={actorId} />
        <div className="form-section">
          <p className="form-section-label">Nova cotação</p>
          <div>
            <label className="label" htmlFor="cotacao-supplier-name">Fornecedor</label>
            <input id="cotacao-supplier-name" className="input" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label className="label" htmlFor="cotacao-initial-value">Valor inicial</label>
              <input id="cotacao-initial-value" className="input" type="number" value={initialValue} onChange={(e) => setInitialValue(Number(e.target.value))} />
            </div>
            <div>
              <label className="label" htmlFor="cotacao-negotiated-value">Valor negociado</label>
              <input id="cotacao-negotiated-value" className="input" type="number" value={negotiatedValue} onChange={(e) => setNegotiatedValue(Number(e.target.value))} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="cotacao-payment-condition">Condição de pagamento</label>
            <input id="cotacao-payment-condition" className="input" value={paymentCondition} onChange={(e) => setPaymentCondition(e.target.value)} />
          </div>
        </div>
        <ErrorBox error={error} />
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            variant="secondary"
            disabled={loading || !actorId || !supplierName || !paymentCondition}
            onClick={() => {
              onSubmit(`/api/requests/${request.id}/cotacao`, "POST", { addedBy: actorId, supplierName, initialValue, negotiatedValue, paymentCondition });
              setSupplierName(""); setInitialValue(0); setNegotiatedValue(0); setPaymentCondition("");
            }}
          >
            Adicionar cotação
          </Button>
          <Button variant="primary" disabled={loading || !actorId} onClick={() => onSubmit(`/api/requests/${request.id}/cotacao`, "PATCH", { actorId })}>
            Avançar para Mapa de Cotação
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function MapaCotacaoForm({
  request, onSubmit, loading, error, sessionActor,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null; sessionActor: SessionActor }) {
  const [actorId, setActorId] = useActorId(sessionActor, request.buyerId ?? "");
  const [selectedQuoteId, setSelectedQuoteId] = useState("");

  return (
    <Panel title="Mapa de Cotação">
      <div style={{ display: "grid", gap: 10 }}>
        <div className="form-section">
          <p className="form-section-label">Cotações</p>
          {request.quotes.map((q) => {
            const saving = q.initialValue > 0 ? ((q.initialValue - q.negotiatedValue) / q.initialValue) * 100 : 0;
            return (
              <label key={q.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: 8, border: "1px solid var(--border-soft)", borderRadius: 8 }}>
                <span>
                  <input type="radio" name="quote" checked={selectedQuoteId === q.id} onChange={() => setSelectedQuoteId(q.id)} />{" "}
                  <strong>{q.supplierName}</strong> — R$ {q.negotiatedValue.toLocaleString("pt-BR")} ({q.paymentCondition})
                </span>
                <span style={{ color: saving >= 0 ? "var(--acerto-green)" : "var(--danger)", fontWeight: 700 }}>saving {saving.toFixed(1)}%</span>
              </label>
            );
          })}
        </div>
        <div className="form-section">
          <ActorField label="Comprador responsável" sessionActor={sessionActor} value={actorId} onChange={setActorId} role="COMPRADOR" />
        </div>
        <AiInsightPanel requestId={request.id} stage="MAPA_COTACAO" actorId={actorId} />
        <ErrorBox error={error} />
        <Button variant="primary" disabled={loading || !actorId || !selectedQuoteId} onClick={() => onSubmit(`/api/requests/${request.id}/mapa-cotacao`, "PATCH", { actorId, selectedQuoteId })}>
          Selecionar vencedor e avançar para Aprovação
        </Button>
      </div>
    </Panel>
  );
}

function AprovacaoGestorForm({
  request, onSubmit, loading, error, sessionActor,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null; sessionActor: SessionActor }) {
  const [actorId, setActorId] = useActorId(sessionActor);
  const [justification, setJustification] = useState("");

  return (
    <Panel title="Aprovação do Gestor">
      <div style={{ display: "grid", gap: 10 }}>
        {request.approverManager ? (
          <p className="hint-box hint-box-info">
            Esta solicitação aguarda a decisão de <strong>{request.approverManager.name}</strong> ({request.approverManager.email}),
            gestor responsável pelo centro de custo escolhido.
          </p>
        ) : (
          <p className="hint-box hint-box-warning">
            Este centro de custo ainda não tem um gestor aprovador definido. Peça a um administrador para configurar
            um em Administração → Centros de Custo, ou selecione manualmente abaixo quem está decidindo agora.
          </p>
        )}
        <div className="form-section">
          <ActorField label="Quem está decidindo" sessionActor={sessionActor} value={actorId} onChange={setActorId} role="APROVADOR" placeholder="Selecione o gestor aprovador" />
          <label className="label" htmlFor="aprovacao-gestor-justification" style={{ marginTop: 8 }}>Justificativa (obrigatória para reprovar)</label>
          <input id="aprovacao-gestor-justification" className="input" value={justification} onChange={(e) => setJustification(e.target.value)} />
        </div>
        <ErrorBox error={error} />
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            variant="primary"
            disabled={loading || !actorId}
            onClick={() => onSubmit(`/api/requests/${request.id}/aprovacao-gestor`, "PATCH", { actorId, decision: "APROVADO", justification: justification || undefined })}
          >
            Aprovar
          </Button>
          <Button
            variant="secondary"
            disabled={loading || !actorId || !justification}
            onClick={() => onSubmit(`/api/requests/${request.id}/aprovacao-gestor`, "PATCH", { actorId, decision: "REPROVADO", justification })}
          >
            Reprovar
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function AprovacaoForm({
  request, onSubmit, loading, error, sessionActor, declaredByNames,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null; sessionActor: SessionActor; declaredByNames: Record<string, string> }) {
  // approverId: NÃO é o ator — é uma atribuição (o comprador roteia a
  // solicitação para um aprovador específico da alçada), ver requireSelf:
  // false em POST /api/requests/[id]/aprovacao. Continua manual mesmo com
  // sessão real.
  const [approverId, setApproverId] = useState("");
  const [approvalId, setApprovalId] = useState("");
  const [justification, setJustification] = useState("");
  // personifiedBy é opcional (normalmente vazio — o aprovador real decide);
  // só quando marcado é que a pessoa logada está personificando, então usa
  // checkbox em vez do padrão ActorField (que sempre preencheria).
  const [personifying, setPersonifying] = useState(false);
  const [manualPersonifiedBy, setManualPersonifiedBy] = useState("");
  const personifiedBy = sessionActor ? (personifying ? sessionActor.id : "") : manualPersonifiedBy;
  // declaredBy: rota /conflito-interesse não valida identidade (pode ser o
  // solicitante ou o comprador declarando) — mantém manual.
  const [declaredBy, setDeclaredBy] = useState(request.buyerId ?? "");
  const [hasConflict, setHasConflict] = useState(false);
  const [conflictDetails, setConflictDetails] = useState("");

  const hasDeclaration = request.conflictDeclarations.length > 0;
  const latestDeclaration = hasDeclaration ? request.conflictDeclarations[0] : null;
  const latestHasConflict = Boolean(latestDeclaration?.hasConflict);

  // Cada declaração nova (inclusive uma que confirma conflito) some da tela
  // e vira uma caixa de aviso idêntica à anterior — sem isto, o checkbox
  // "tenho conflito" continuava marcado e cada novo clique em "Registrar"
  // só recriava o mesmo bloqueio, parecendo que o botão não fazia nada.
  useEffect(() => {
    setHasConflict(false);
    setConflictDetails("");
  }, [latestDeclaration?.id]);

  return (
    <Panel title="Aprovação">
      <div style={{ display: "grid", gap: 10 }}>
        {latestHasConflict && (
          <div className="hint-box hint-box-danger">
            <p style={{ fontSize: 11, fontWeight: 700 }}>
              Conflito de interesse já registrado — a aprovação não pode ser criada enquanto isso não mudar.
            </p>
            <p style={{ fontSize: 11, marginTop: 4 }}>
              Declarado por {declaredByNames[latestDeclaration!.declaredBy] ?? "alguém"} em{" "}
              {new Date(latestDeclaration!.createdAt).toLocaleString("pt-BR")}
              {latestDeclaration!.details ? `: "${latestDeclaration!.details}"` : ""}.
            </p>
            <p style={{ fontSize: 11, marginTop: 4 }}>
              Se foi um engano, registre uma nova declaração abaixo com a caixa desmarcada. Se o conflito é real,
              reatribua comprador/aprovador antes de prosseguir.
            </p>
          </div>
        )}
        {!hasDeclaration || latestHasConflict ? (
          <div className="hint-box hint-box-warning">
            <p style={{ fontSize: 11, fontWeight: 700, marginBottom: 8 }}>
              Declaração de conflito de interesse obrigatória antes de criar a aprovação.
            </p>
            <label className="label" htmlFor="aprovacao-declared-by">Quem declara (solicitante ou comprador)</label>
            <UserPicker id="aprovacao-declared-by" value={declaredBy} onChange={setDeclaredBy} placeholder="Selecione o declarante" />
            <label style={{ fontSize: 12, display: "block", marginTop: 8 }}>
              <input type="checkbox" checked={hasConflict} onChange={(e) => setHasConflict(e.target.checked)} /> Tenho relação pessoal/familiar/financeira com o fornecedor
            </label>
            {hasConflict && (
              <input className="input" style={{ marginTop: 8 }} placeholder="Detalhe o conflito" value={conflictDetails} onChange={(e) => setConflictDetails(e.target.value)} />
            )}
            <Button
              variant="secondary" style={{ marginTop: 8 }}
              disabled={loading || !declaredBy || (hasConflict && !conflictDetails)}
              onClick={() => onSubmit(`/api/requests/${request.id}/conflito-interesse`, "POST", { declaredBy, hasConflict, details: conflictDetails })}
            >
              Registrar declaração
            </Button>
          </div>
        ) : (
          <>
            <div className="form-section">
              <p className="form-section-label">1. Criar aprovação</p>
              <label className="label" htmlFor="aprovacao-approver">Aprovador</label>
              <div style={{ display: "flex", gap: 8 }}>
                <UserPicker id="aprovacao-approver" value={approverId} onChange={setApproverId} role="APROVADOR" />
                <Button variant="secondary" disabled={loading || !approverId} onClick={() => onSubmit(`/api/requests/${request.id}/aprovacao`, "POST", { approverId })}>
                  Criar
                </Button>
              </div>
            </div>
            <AiInsightPanel requestId={request.id} stage="APROVACAO" actorId={approverId} />
            <div className="form-section">
              <p className="form-section-label">2. Decidir</p>
              <label className="label" htmlFor="aprovacao-select">Aprovação</label>
              <select id="aprovacao-select" className="input" value={approvalId} onChange={(e) => setApprovalId(e.target.value)}>
                <option value="">Selecione a aprovação</option>
                {request.approvals.map((a) => (
                  <option key={a.id} value={a.id}>
                    Nível {a.level} · {a.approver.name} · {a.decision}
                  </option>
                ))}
              </select>
              <label className="label" htmlFor="aprovacao-justification" style={{ marginTop: 8 }}>Justificativa</label>
              <input id="aprovacao-justification" className="input" value={justification} onChange={(e) => setJustification(e.target.value)} />
              <fieldset style={{ border: "none", margin: "8px 0 0", padding: 0 }}>
                <legend className="label" style={{ marginBottom: 5 }}>
                  Personificado por (comprador) — só permitido até R$ 50 mil
                </legend>
                {sessionActor ? (
                  <label style={{ fontSize: 12 }}>
                    <input type="checkbox" checked={personifying} onChange={(e) => setPersonifying(e.target.checked)} />
                    {" "}Estou personificando o aprovador real (urgência/ausência) — {sessionActor.name}
                  </label>
                ) : (
                  <UserPicker value={manualPersonifiedBy} onChange={setManualPersonifiedBy} role="COMPRADOR" placeholder="Nenhum (aprovador real decide)" />
                )}
              </fieldset>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Button
                  variant="primary"
                  disabled={loading || !approvalId}
                  onClick={() =>
                    onSubmit(`/api/requests/${request.id}/aprovacao`, "PATCH", {
                      approvalId, decision: "APROVADO", justification, personifiedBy: personifiedBy || undefined,
                    })
                  }
                >
                  Aprovar
                </Button>
                <Button
                  variant="secondary"
                  disabled={loading || !approvalId}
                  onClick={() =>
                    onSubmit(`/api/requests/${request.id}/aprovacao`, "PATCH", {
                      approvalId, decision: "REPROVADO", justification, personifiedBy: personifiedBy || undefined,
                    })
                  }
                >
                  Reprovar
                </Button>
              </div>
            </div>
          </>
        )}
        <ErrorBox error={error} />
      </div>
    </Panel>
  );
}

function JuridicoForm({
  request, onSubmit, loading, error, sessionActor,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null; sessionActor: SessionActor }) {
  const [actorId, setActorId] = useActorId(sessionActor);
  const [minutaUrl, setMinutaUrl] = useState("");
  const [signedDocUrl, setSignedDocUrl] = useState("");
  const [observations, setObservations] = useState("");
  const isCancelamento = request.demandType === "CANCELAMENTO";

  return (
    <Panel title="Jurídico">
      <div style={{ display: "grid", gap: 10 }}>
        {isCancelamento && (
          <p className="hint-box hint-box-warning">
            Cancelamento de Contrato, Serviços e Ferramentas — ao assinar, a solicitação é encerrada direto
            (sem Pedido de Compra nem Mapeamento de Contrato, já que o contrato já existe e já está mapeado).
            Lembre-se de cancelar o contrato correspondente em Contratos (ação Cancelar) para notificar a Tesouraria.
          </p>
        )}
        <div className="form-section">
          <ActorField label="Responsável (Jurídico)" sessionActor={sessionActor} value={actorId} onChange={setActorId} role="JURIDICO" />
        </div>
        <AiInsightPanel requestId={request.id} stage="JURIDICO" actorId={actorId} draft={{ minutaUrl, observations }} />
        <div className="form-section">
          <p className="form-section-label">Documentos</p>
          <div>
            <label className="label" htmlFor="juridico-minuta-url">URL da minuta</label>
            <input id="juridico-minuta-url" className="input" value={minutaUrl} onChange={(e) => setMinutaUrl(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="juridico-signed-doc-url">URL do documento assinado</label>
            <input id="juridico-signed-doc-url" className="input" value={signedDocUrl} onChange={(e) => setSignedDocUrl(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="juridico-observations">Observações</label>
            <input id="juridico-observations" className="input" value={observations} onChange={(e) => setObservations(e.target.value)} />
          </div>
        </div>
        <ErrorBox error={error} />
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            variant="secondary"
            disabled={loading || !actorId}
            onClick={() => onSubmit(`/api/requests/${request.id}/juridico`, "PATCH", { actorId, minutaUrl, signedDocUrl, observations, signed: false })}
          >
            Salvar minuta (em andamento)
          </Button>
          <Button
            variant="primary"
            disabled={loading || !actorId || !signedDocUrl}
            onClick={() => onSubmit(`/api/requests/${request.id}/juridico`, "PATCH", { actorId, minutaUrl, signedDocUrl, observations, signed: true })}
          >
            Marcar como assinado e avançar
          </Button>
        </div>
      </div>
    </Panel>
  );
}

type PcItem = { descricao: string; quantidade: number; valorUnitario: number; impostosPercent: number };

const emptyItem = (): PcItem => ({ descricao: "", quantidade: 1, valorUnitario: 0, impostosPercent: 0 });

function PedidoCompraForm({
  request, onSubmit, loading, error, sessionActor,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null; sessionActor: SessionActor }) {
  const winningQuote = request.quotes.find((q) => q.selected);
  const [actorId, setActorId] = useActorId(sessionActor, request.buyerId ?? "");
  const [supplierId, setSupplierId] = useState("");
  const [supplierLegalName, setSupplierLegalName] = useState(winningQuote?.supplierName ?? "");
  const [supplierCnpj, setSupplierCnpj] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [installments, setInstallments] = useState(1);
  const [installmentValue, setInstallmentValue] = useState(0);
  const [installmentValueTouched, setInstallmentValueTouched] = useState(false);
  const [needsMeasurement, setNeedsMeasurement] = useState(false);
  const [prazoEntrega, setPrazoEntrega] = useState("");
  const [localEntrega, setLocalEntrega] = useState("");
  const [frete, setFrete] = useState<"CIF" | "FOB">("CIF");
  const [items, setItems] = useState<PcItem[]>([emptyItem()]);

  function updateItem(index: number, patch: Partial<PcItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  const validItems = items.filter((it) => it.descricao && it.quantidade > 0 && it.valorUnitario > 0);
  const totalValue = validItems.reduce((sum, it) => sum + it.quantidade * it.valorUnitario * (1 + it.impostosPercent / 100), 0);
  const negotiatedValue = winningQuote?.negotiatedValue ?? totalValue;

  // Valor da parcela sugerido automaticamente (negotiatedValue / parcelas) —
  // ajuda a preencher fluxo de caixa depois. Só recalcula sozinho enquanto o
  // comprador não editar manualmente (ex: para acertar arredondamento).
  useEffect(() => {
    if (!installmentValueTouched && installments > 0) {
      setInstallmentValue(Math.round((negotiatedValue / installments) * 100) / 100);
    }
  }, [negotiatedValue, installments, installmentValueTouched]);

  return (
    <Panel title="Pedido de Compra">
      <div style={{ display: "grid", gap: 10 }}>
        <div className="form-section">
          <ActorField label="Comprador responsável" sessionActor={sessionActor} value={actorId} onChange={setActorId} role="COMPRADOR" />
        </div>

        <div className="form-section">
          <p className="form-section-label">Fornecedor</p>
          <div>
            <label className="label" htmlFor="pedido-supplier-picker">Fornecedor cadastrado (opcional)</label>
            <SupplierPicker
              id="pedido-supplier-picker"
              onSelect={(s) => {
                setSupplierId(s.id);
                setSupplierLegalName(s.legalName);
                setSupplierCnpj(s.cnpj);
                setContactName(s.contactName ?? "");
                setContactPhone(s.contactPhone ?? "");
                setContactEmail(s.contactEmail ?? "");
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label className="label" htmlFor="pedido-supplier-legal-name">Razão social do fornecedor</label>
              <input id="pedido-supplier-legal-name" className="input" value={supplierLegalName} onChange={(e) => setSupplierLegalName(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="pedido-supplier-cnpj">CNPJ</label>
              <input id="pedido-supplier-cnpj" className="input" value={supplierCnpj} onChange={(e) => setSupplierCnpj(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label className="label" htmlFor="pedido-contact-name">Contato</label>
              <input id="pedido-contact-name" className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="pedido-contact-phone">Telefone</label>
              <input id="pedido-contact-phone" className="input" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="pedido-contact-email">E-mail</label>
              <input id="pedido-contact-email" className="input" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="form-section">
          <p className="form-section-label">Itens</p>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr 1.2fr 1fr auto", gap: 6 }}>
              <span className="help" style={{ margin: 0 }}>Descrição</span>
              <span className="help" style={{ margin: 0 }}>Qtd</span>
              <span className="help" style={{ margin: 0 }}>Vlr. unitário</span>
              <span className="help" style={{ margin: 0 }}>Impostos %</span>
              <span />
            </div>
            {items.map((it, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "3fr 1fr 1.2fr 1fr auto", gap: 6 }}>
                <input aria-label={`Descrição do item ${i + 1}`} className="input" placeholder="Descrição" value={it.descricao} onChange={(e) => updateItem(i, { descricao: e.target.value })} />
                <input aria-label={`Quantidade do item ${i + 1}`} className="input" type="number" placeholder="Qtd" value={it.quantidade} onChange={(e) => updateItem(i, { quantidade: Number(e.target.value) })} />
                <input aria-label={`Valor unitário do item ${i + 1}`} className="input" type="number" placeholder="Vlr. unitário" value={it.valorUnitario} onChange={(e) => updateItem(i, { valorUnitario: Number(e.target.value) })} />
                <input aria-label={`Impostos do item ${i + 1}`} className="input" type="number" placeholder="Impostos %" value={it.impostosPercent} onChange={(e) => updateItem(i, { impostosPercent: Number(e.target.value) })} />
                <Button
                  variant="secondary" style={{ padding: "8px 10px" }}
                  disabled={items.length === 1}
                  aria-label={`Remover item ${i + 1}`}
                  onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="secondary" style={{ marginTop: 6 }}
            onClick={() => setItems((prev) => [...prev, emptyItem()])}
          >
            + Adicionar item
          </Button>
          {validItems.length > 0 && (
            <p style={{ fontSize: 12.5, fontWeight: 700, textAlign: "right", marginTop: 8 }}>
              Total (com impostos): {totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
          )}
        </div>

        <div className="form-section">
          <p className="form-section-label">Condições comerciais e entrega</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label className="label" htmlFor="pedido-prazo-entrega">Prazo de Entrega</label>
              <input id="pedido-prazo-entrega" className="input" value={prazoEntrega} onChange={(e) => setPrazoEntrega(e.target.value)} placeholder="Ex: 15 dias úteis" />
            </div>
            <div>
              <label className="label" htmlFor="pedido-installments">Número de Parcelas</label>
              <input id="pedido-installments" className="input" type="number" value={installments} onChange={(e) => setInstallments(Number(e.target.value))} />
            </div>
            <div>
              <label className="label" htmlFor="pedido-installment-value">Valor da Parcela</label>
              <input
                id="pedido-installment-value" aria-describedby="pedido-installment-value-hint"
                className="input" type="number" value={installmentValue}
                onChange={(e) => { setInstallmentValueTouched(true); setInstallmentValue(Number(e.target.value)); }}
              />
              <span id="pedido-installment-value-hint" className="help" style={{ margin: "2px 0 0" }}>
                Sugerido: {(negotiatedValue / (installments || 1)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} — ajuda a alimentar o fluxo de caixa
              </span>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="pedido-local-entrega">Local de Entrega / Instruções de Recebimento</label>
            <input id="pedido-local-entrega" className="input" value={localEntrega} onChange={(e) => setLocalEntrega(e.target.value)} placeholder="Endereço e/ou instruções de recebimento" />
          </div>

          <div>
            <label className="label" htmlFor="pedido-frete">Frete</label>
            <select id="pedido-frete" className="input" value={frete} onChange={(e) => setFrete(e.target.value as "CIF" | "FOB")}>
              <option value="CIF">CIF</option>
              <option value="FOB">FOB</option>
            </select>
          </div>

          <label style={{ fontSize: 12 }}>
            <input type="checkbox" checked={needsMeasurement} onChange={(e) => setNeedsMeasurement(e.target.checked)} /> Precisa de medição antes da entrega/conclusão
          </label>
        </div>
        <ErrorBox error={error} />
        <Button
          variant="primary"
          disabled={loading || !actorId || !supplierLegalName || !supplierCnpj || !contactName || !contactPhone || !contactEmail || !prazoEntrega || !localEntrega || validItems.length === 0}
          onClick={() =>
            onSubmit(`/api/requests/${request.id}/pedido-compra`, "POST", {
              actorId, supplierId: supplierId || undefined, supplierLegalName, supplierCnpj, contactName, contactPhone, contactEmail,
              initialValue: winningQuote?.initialValue ?? totalValue,
              negotiatedValue,
              paymentCondition: winningQuote?.paymentCondition ?? "à vista",
              installments, installmentValue, needsMeasurement, prazoEntrega, localEntrega, frete,
              items: validItems.map((it) => ({
                ...it,
                valorTotal: it.quantidade * it.valorUnitario * (1 + it.impostosPercent / 100),
              })),
            })
          }
        >
          Gerar PC
        </Button>
      </div>
    </Panel>
  );
}

function AguardandoEntregaForm({
  request, onSubmit, loading, error, sessionActor,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null; sessionActor: SessionActor }) {
  const [actorId, setActorId] = useActorId(sessionActor, request.buyerId ?? "");

  return (
    <Panel title="Aguardando Entrega/Conclusão">
      <div style={{ display: "grid", gap: 10 }}>
        {request.purchaseOrder?.pdfUrl && (
          <a href={request.purchaseOrder.pdfUrl} target="_blank" style={{ fontSize: 12, color: "var(--acerto-green)" }}>
            Baixar PDF do Pedido de Compra
          </a>
        )}
        <div className="form-section">
          <ActorField label="Comprador responsável" sessionActor={sessionActor} value={actorId} onChange={setActorId} role="COMPRADOR" />
        </div>
        <ErrorBox error={error} />
        <Button variant="primary" disabled={loading || !actorId} onClick={() => onSubmit(`/api/requests/${request.id}/aguardando-entrega`, "PATCH", { actorId })}>
          Confirmar entrega/recebimento e avançar
        </Button>
      </div>
    </Panel>
  );
}

function MedicaoForm({
  request, onSubmit, loading, error, sessionActor,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null; sessionActor: SessionActor }) {
  const [actorId, setActorId] = useActorId(sessionActor, request.buyerId ?? "");
  const [scopeExecuted, setScopeExecuted] = useState("");
  const [quantities, setQuantities] = useState("");
  const [reviewComment, setReviewComment] = useState("");

  return (
    <Panel title="Medição e Aprovação Financeira">
      <div style={{ display: "grid", gap: 10 }}>
        <div className="form-section">
          <ActorField label="Comprador responsável" sessionActor={sessionActor} value={actorId} onChange={setActorId} role="COMPRADOR" />
        </div>
        <div className="form-section">
          <p className="form-section-label">Medição</p>
          <div>
            <label className="label" htmlFor="medicao-scope-executed">Escopo executado</label>
            <input id="medicao-scope-executed" className="input" value={scopeExecuted} onChange={(e) => setScopeExecuted(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="medicao-quantities">Quantidades</label>
            <input id="medicao-quantities" className="input" value={quantities} onChange={(e) => setQuantities(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="medicao-review-comment">Comentário</label>
            <input id="medicao-review-comment" className="input" value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} />
          </div>
        </div>
        <ErrorBox error={error} />
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            variant="primary"
            disabled={loading || !actorId || !scopeExecuted}
            onClick={() => onSubmit(`/api/requests/${request.id}/medicao`, "PATCH", { actorId, scopeExecuted, quantities, reviewComment, technicalApproval: "APROVADO" })}
          >
            Aprovar e avançar para Fiscal
          </Button>
          <Button
            variant="secondary"
            disabled={loading || !actorId || !scopeExecuted}
            onClick={() => onSubmit(`/api/requests/${request.id}/medicao`, "PATCH", { actorId, scopeExecuted, quantities, reviewComment, technicalApproval: "REPROVADO" })}
          >
            Registrar reprovação (permanece na etapa)
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function FiscalForm({
  request, onSubmit, loading, error, sessionActor,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null; sessionActor: SessionActor }) {
  const [actorId, setActorId] = useActorId(sessionActor);
  const [documentUrl, setDocumentUrl] = useState("");
  const [reviewComment, setReviewComment] = useState("");

  return (
    <Panel title="Validação Fiscal">
      <div style={{ display: "grid", gap: 10 }}>
        <div className="form-section">
          <ActorField label="Responsável (Fiscal)" sessionActor={sessionActor} value={actorId} onChange={setActorId} role="FISCAL" />
        </div>
        <div className="form-section">
          <p className="form-section-label">Documento fiscal</p>
          <div>
            <label className="label" htmlFor="fiscal-document-url">URL do documento fiscal</label>
            <input id="fiscal-document-url" className="input" value={documentUrl} onChange={(e) => setDocumentUrl(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="fiscal-review-comment">Comentário</label>
            <input id="fiscal-review-comment" className="input" value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} />
          </div>
        </div>
        <ErrorBox error={error} />
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="primary" disabled={loading || !actorId || !documentUrl} onClick={() => onSubmit(`/api/requests/${request.id}/fiscal`, "PATCH", { actorId, documentUrl, reviewComment, approved: true })}>
            Aprovar e avançar para Tesouraria
          </Button>
          <Button variant="danger" disabled={loading || !actorId || !documentUrl} onClick={() => onSubmit(`/api/requests/${request.id}/fiscal`, "PATCH", { actorId, documentUrl, reviewComment, approved: false })}>
            Reprovar
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function TesourariaForm({
  request, onSubmit, loading, error, sessionActor,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null; sessionActor: SessionActor }) {
  const [actorId, setActorId] = useActorId(sessionActor);
  const [scheduledDate, setScheduledDate] = useState("");
  const [paidDate, setPaidDate] = useState("");

  return (
    <Panel title="Tesouraria (Pagamento)">
      <div style={{ display: "grid", gap: 10 }}>
        <div className="form-section">
          <ActorField label="Responsável (Tesouraria)" sessionActor={sessionActor} value={actorId} onChange={setActorId} role="TESOURARIA" />
        </div>
        <div className="form-section">
          <p className="form-section-label">Pagamento</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label className="label" htmlFor="tesouraria-scheduled-date">Data programada</label>
              <input id="tesouraria-scheduled-date" className="input" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="tesouraria-paid-date">Data de pagamento</label>
              <input id="tesouraria-paid-date" className="input" type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            </div>
          </div>
        </div>
        <ErrorBox error={error} />
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            variant="secondary"
            disabled={loading || !actorId}
            onClick={() => onSubmit(`/api/requests/${request.id}/tesouraria`, "PATCH", { actorId, scheduledDate, status: "PROGRAMADO", erpConfirmed: false })}
          >
            Programar pagamento
          </Button>
          <Button
            variant="primary"
            disabled={loading || !actorId || !paidDate}
            onClick={() => onSubmit(`/api/requests/${request.id}/tesouraria`, "PATCH", { actorId, scheduledDate, paidDate, status: "PAGO", erpConfirmed: true })}
          >
            Confirmar pagamento no ERP e avançar
          </Button>
        </div>
      </div>
    </Panel>
  );
}

const DOCUMENT_TYPES = [
  "Contrato de Prestação de Serviço",
  "Contrato de Licenciamento de Software",
  "Termo Aditivo",
  "Acordo de Confidencialidade (NDA)",
  "Outro",
];

function MapeamentoContratoForm({
  request, onSubmit, loading, error, sessionActor,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null; sessionActor: SessionActor }) {
  const winningQuote = request.quotes.find((q) => q.selected);
  const [actorId, setActorId] = useActorId(sessionActor, request.buyerId ?? "");
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState(winningQuote?.supplierName ?? "");
  const [supplierTradeName, setSupplierTradeName] = useState("");
  const [supplierCnpj, setSupplierCnpj] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [contractObject, setContractObject] = useState(request.shortDescription ?? "");
  const [prazo, setPrazo] = useState("");
  const [paymentCondition, setPaymentCondition] = useState(request.purchaseOrder?.paymentCondition ?? winningQuote?.paymentCondition ?? "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [renewalDate, setRenewalDate] = useState("");
  const [terminationClause, setTerminationClause] = useState("");
  const [contractManagerId, setContractManagerId] = useState(request.buyerId ?? "");
  const [area, setArea] = useState("");
  const [lgpdClause, setLgpdClause] = useState(false);
  const [nonCompete, setNonCompete] = useState(false);
  const [brandUse, setBrandUse] = useState(false);
  const [corporateChangeClause, setCorporateChangeClause] = useState(false);

  return (
    <Panel title="Mapeamento de Contrato">
      <div style={{ display: "grid", gap: 10 }}>
        <div className="form-section">
          <ActorField label="Comprador responsável" sessionActor={sessionActor} value={actorId} onChange={setActorId} role="COMPRADOR" />
        </div>

        <AiInsightPanel
          requestId={request.id}
          stage="MAPEAMENTO_CONTRATO"
          actorId={actorId}
          draft={{ supplierName, contractObject, prazo, paymentCondition, terminationClause, nonCompete, lgpdClause, brandUse, corporateChangeClause }}
        />

        <div className="form-section">
          <p className="form-section-label">Fornecedor</p>
          <div>
            <label className="label" htmlFor="mapeamento-supplier-picker">Fornecedor cadastrado (opcional)</label>
            <SupplierPicker
              id="mapeamento-supplier-picker"
              onSelect={(s) => {
                setSupplierId(s.id);
                setSupplierName(s.legalName);
                setSupplierTradeName(s.tradeName ?? "");
                setSupplierCnpj(s.cnpj);
              }}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label className="label" htmlFor="mapeamento-supplier-name">Razão Social</label>
              <input id="mapeamento-supplier-name" className="input" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="mapeamento-supplier-trade-name">Nome Fantasia</label>
              <input id="mapeamento-supplier-trade-name" className="input" value={supplierTradeName} onChange={(e) => setSupplierTradeName(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label className="label" htmlFor="mapeamento-supplier-cnpj">CNPJ</label>
              <input id="mapeamento-supplier-cnpj" className="input" value={supplierCnpj} onChange={(e) => setSupplierCnpj(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="mapeamento-document-type">Tipo de Documento</label>
              <select id="mapeamento-document-type" className="input" value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
                <option value="">Selecione</option>
                {DOCUMENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="form-section">
          <p className="form-section-label">Objeto e vigência</p>
          <div>
            <label className="label" htmlFor="mapeamento-contract-object">Objeto do Contrato</label>
            <textarea id="mapeamento-contract-object" className="input" style={{ minHeight: 60, resize: "vertical" }} value={contractObject} onChange={(e) => setContractObject(e.target.value)} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label className="label" htmlFor="mapeamento-start-date">Início da Vigência</label>
              <input id="mapeamento-start-date" className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="mapeamento-end-date">Fim da Vigência</label>
              <input id="mapeamento-end-date" className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="mapeamento-renewal-date">Renovação prevista</label>
              <input id="mapeamento-renewal-date" className="input" type="date" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label className="label" htmlFor="mapeamento-prazo">Prazo</label>
              <input id="mapeamento-prazo" className="input" value={prazo} onChange={(e) => setPrazo(e.target.value)} placeholder="Ex: 12 meses, renovação automática" />
            </div>
            <div>
              <label className="label" htmlFor="mapeamento-payment-condition">Condição de Pagamento</label>
              <input id="mapeamento-payment-condition" className="input" value={paymentCondition} onChange={(e) => setPaymentCondition(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="form-section">
          <p className="form-section-label">Cláusulas</p>
          <div>
            <label className="label" htmlFor="mapeamento-termination-clause">Cláusula de Renovação e Rescisão</label>
            <textarea id="mapeamento-termination-clause" className="input" style={{ minHeight: 60, resize: "vertical" }} value={terminationClause} onChange={(e) => setTerminationClause(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 12, flexWrap: "wrap" }}>
            <label><input type="checkbox" checked={lgpdClause} onChange={(e) => setLgpdClause(e.target.checked)} /> Cláusula LGPD</label>
            <label><input type="checkbox" checked={nonCompete} onChange={(e) => setNonCompete(e.target.checked)} /> Não-concorrência</label>
            <label><input type="checkbox" checked={brandUse} onChange={(e) => setBrandUse(e.target.checked)} /> Uso de marca</label>
            <label><input type="checkbox" checked={corporateChangeClause} onChange={(e) => setCorporateChangeClause(e.target.checked)} /> Mudança societária</label>
          </div>
        </div>

        <div className="form-section">
          <p className="form-section-label">Gestão</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label className="label" htmlFor="mapeamento-contract-manager">Gestor do contrato</label>
              <UserPicker id="mapeamento-contract-manager" value={contractManagerId} onChange={setContractManagerId} />
            </div>
            <div>
              <label className="label" htmlFor="mapeamento-area">Área</label>
              <input id="mapeamento-area" className="input" value={area} onChange={(e) => setArea(e.target.value)} />
            </div>
          </div>
        </div>
        <ErrorBox error={error} />
        <Button
          variant="primary"
          disabled={loading || !actorId || !supplierName || !startDate || !endDate || !renewalDate || !contractManagerId || !area}
          onClick={() =>
            onSubmit(`/api/requests/${request.id}/mapeamento-contrato`, "POST", {
              actorId, supplierId: supplierId || undefined, supplierName, supplierTradeName, supplierCnpj, documentType,
              contractObject, prazo, paymentCondition, startDate, endDate, terminationClause, renewalDate,
              contractManagerId, area, lgpdClause, nonCompete, brandUse, corporateChangeClause,
            })
          }
        >
          Cadastrar contrato e concluir
        </Button>
      </div>
    </Panel>
  );
}

function ConcluidoPanel({
  request, onSubmit, loading, error,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null }) {
  const [score, setScore] = useState(10);
  const [feedback, setFeedback] = useState("");

  return (
    <Panel title="Concluído">
      <div style={{ display: "grid", gap: 10 }}>
        {request.contract && <a href={`/contratos/${request.contract.id}`} style={{ fontSize: 12, color: "var(--acerto-green)" }}>Ver contrato mapeado →</a>}
        {request.purchaseOrder && (
          <a href={`/api/requests/${request.id}/pedido-compra/pdf`} target="_blank" style={{ fontSize: 12, color: "var(--acerto-green)" }}>
            Baixar PDF do Pedido de Compra
          </a>
        )}
        {request.supplierEvaluation ? (
          <p style={{ fontSize: 12, color: "var(--ink-muted)" }}>Avaliação (NPS) já registrada. Obrigado!</p>
        ) : (
          <>
            <label className="label" htmlFor="avaliacao-score" style={{ fontSize: 12, fontWeight: 400, color: "var(--ink-muted)" }}>
              Como foi sua experiência com este processo de compra? (0–10)
            </label>
            <input id="avaliacao-score" className="input" type="number" min={0} max={10} value={score} onChange={(e) => setScore(Number(e.target.value))} />
            <label className="label" htmlFor="avaliacao-feedback" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
              Comentário (opcional)
            </label>
            <input id="avaliacao-feedback" className="input" placeholder="Comentário (opcional)" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
            <ErrorBox error={error} />
            <Button variant="primary" disabled={loading} onClick={() => onSubmit(`/api/requests/${request.id}/avaliacao`, "POST", { score, feedback })}>
              Enviar avaliação
            </Button>
          </>
        )}
      </div>
    </Panel>
  );
}
