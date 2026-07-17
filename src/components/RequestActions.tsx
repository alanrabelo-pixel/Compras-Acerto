"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPicker } from "@/components/UserPicker";
import { SupplierPicker } from "@/components/SupplierPicker";

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
  demandType: string;
  needsContract?: boolean | null;
  needsMapping?: boolean | null;
  conflictDeclarations: { id: string; hasConflict: boolean }[];
  approvals: { id: string; level: number; decision: string; approver: { name: string } }[];
  quotes: Quote[];
  purchaseOrder: { id: string; needsMeasurement: boolean; pdfUrl?: string | null } | null;
  contract: { id: string } | null;
  supplierEvaluation: { id: string } | null;
};

type Submit = (url: string, method: string, body: unknown) => void;

export function RequestActions({ request }: { request: RequestData }) {
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
    case "TRIAGEM":
      return <TriagemForm request={request} onSubmit={call} loading={loading} error={error} />;
    case "VALIDACAO_ORCAMENTARIA":
      return <ValidacaoForm request={request} onSubmit={call} loading={loading} error={error} />;
    case "DUE_DILIGENCE":
      return <DueDiligenceForm request={request} onSubmit={call} loading={loading} error={error} />;
    case "COTACAO":
      return <CotacaoForm request={request} onSubmit={call} loading={loading} error={error} />;
    case "MAPA_COTACAO":
      return <MapaCotacaoForm request={request} onSubmit={call} loading={loading} error={error} />;
    case "APROVACAO":
      return <AprovacaoForm request={request} onSubmit={call} loading={loading} error={error} />;
    case "JURIDICO":
      return <JuridicoForm request={request} onSubmit={call} loading={loading} error={error} />;
    case "PEDIDO_COMPRA":
      return <PedidoCompraForm request={request} onSubmit={call} loading={loading} error={error} />;
    case "AGUARDANDO_ENTREGA":
      return <AguardandoEntregaForm request={request} onSubmit={call} loading={loading} error={error} />;
    case "MEDICAO":
      return <MedicaoForm request={request} onSubmit={call} loading={loading} error={error} />;
    case "FISCAL":
      return <FiscalForm request={request} onSubmit={call} loading={loading} error={error} />;
    case "TESOURARIA":
      return <TesourariaForm request={request} onSubmit={call} loading={loading} error={error} />;
    case "MAPEAMENTO_CONTRATO":
      return <MapeamentoContratoForm request={request} onSubmit={call} loading={loading} error={error} />;
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
    <section className="card section-gap">
      <h2 className="card-title accent">{title}</h2>
      {children}
    </section>
  );
}

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 8 }}>{error}</p>;
}

function TriagemForm({
  request, onSubmit, loading, error,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null }) {
  const [buyerId, setBuyerId] = useState("");
  const [needsContract, setNeedsContract] = useState(false);
  const [needsMapping, setNeedsMapping] = useState(false);
  const [valueType, setValueType] = useState("FIXO");
  const [supplierApproved, setSupplierApproved] = useState(false);
  const [supplierRiskTier, setSupplierRiskTier] = useState("MEDIO");
  const [handlesPersonalData, setHandlesPersonalData] = useState(request.demandType === "FERRAMENTA_NOVA");
  const [priorValue, setPriorValue] = useState(0);
  const [estimatedValue, setEstimatedValue] = useState(0);
  const needsEstimatedValue = request.estimatedValue === null;

  return (
    <Panel title="Triagem">
      <div style={{ display: "grid", gap: 10 }}>
        <div>
          <label className="label">Comprador responsável (não pode ser o solicitante)</label>
          <UserPicker value={buyerId} onChange={setBuyerId} role="COMPRADOR" placeholder="Selecione o comprador" />
        </div>
        {needsEstimatedValue && (
          <div style={{ background: "#FFF4D6", borderRadius: 8, padding: 10 }}>
            <label className="label">
              Esta solicitação foi aberta sem valor estimado — preencha antes de avançar (necessário para calcular alçada/lane)
            </label>
            <input className="input" type="number" value={estimatedValue} onChange={(e) => setEstimatedValue(Number(e.target.value))} />
          </div>
        )}
        <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
          <label><input type="checkbox" checked={needsContract} onChange={(e) => setNeedsContract(e.target.checked)} /> Precisa de contrato</label>
          <label><input type="checkbox" checked={needsMapping} onChange={(e) => setNeedsMapping(e.target.checked)} /> Precisa de mapeamento</label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label className="label">Tipo de valor</label>
            <select className="input" value={valueType} onChange={(e) => setValueType(e.target.value)}>
              <option value="FIXO">Fixo</option>
              <option value="VARIAVEL">Variável</option>
            </select>
          </div>
          <div>
            <label className="label">Risco do fornecedor</label>
            <select className="input" value={supplierRiskTier} onChange={(e) => setSupplierRiskTier(e.target.value)}>
              <option value="BAIXO">Baixo</option>
              <option value="MEDIO">Médio</option>
              <option value="ALTO">Alto</option>
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
          <label><input type="checkbox" checked={supplierApproved} onChange={(e) => setSupplierApproved(e.target.checked)} /> Fornecedor já homologado</label>
          <label><input type="checkbox" checked={handlesPersonalData} onChange={(e) => setHandlesPersonalData(e.target.checked)} /> Trata dado pessoal</label>
        </div>
        <div>
          <label className="label">Soma de compras deste fornecedor nos últimos 12 meses (R$)</label>
          <input className="input" type="number" value={priorValue} onChange={(e) => setPriorValue(Number(e.target.value))} />
        </div>
        <ErrorBox error={error} />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn-primary"
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
          </button>
          <button
            className="btn btn-secondary"
            disabled={loading || !buyerId}
            onClick={() => onSubmit(`/api/requests/${request.id}/triagem`, "PATCH", { buyerId, action: "DEVOLVER", returnReason: "Informações incompletas — favor detalhar." })}
          >
            Devolver ao solicitante
          </button>
        </div>
      </div>
    </Panel>
  );
}

function ValidacaoForm({
  request, onSubmit, loading, error,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null }) {
  const [justification, setJustification] = useState("");
  const [exceptionApproverId, setExceptionApproverId] = useState("");

  return (
    <Panel title="Validação orçamentária">
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" disabled={loading} onClick={() => onSubmit(`/api/requests/${request.id}/validacao-orcamentaria`, "PATCH", { budgetOk: true })}>
            Há orçamento disponível
          </button>
          <button
            className="btn btn-secondary"
            disabled={loading}
            onClick={() => onSubmit(`/api/requests/${request.id}/validacao-orcamentaria`, "PATCH", { budgetOk: false })}
          >
            Sem orçamento — abrir exceção
          </button>
        </div>
        <div style={{ borderTop: "1px solid #eee", paddingTop: 10 }}>
          <p style={{ fontSize: 11, color: "#666", marginBottom: 8 }}>Se uma exceção já foi aberta, decida abaixo:</p>
          <label className="label">Aprovador da exceção</label>
          <UserPicker value={exceptionApproverId} onChange={setExceptionApproverId} role="CONTROLADORIA" placeholder="Selecione o aprovador da exceção" />
          <label className="label" style={{ marginTop: 8 }}>Justificativa</label>
          <input className="input" value={justification} onChange={(e) => setJustification(e.target.value)} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              className="btn btn-primary"
              disabled={loading}
              onClick={() =>
                onSubmit(`/api/requests/${request.id}/validacao-orcamentaria`, "PATCH", {
                  budgetOk: false, exceptionDecision: "APROVADO", exceptionApproverId, justification,
                })
              }
            >
              Aprovar exceção
            </button>
            <button
              className="btn btn-secondary"
              disabled={loading}
              onClick={() =>
                onSubmit(`/api/requests/${request.id}/validacao-orcamentaria`, "PATCH", {
                  budgetOk: false, exceptionDecision: "REPROVADO", exceptionApproverId, justification,
                })
              }
            >
              Reprovar exceção
            </button>
          </div>
        </div>
        <ErrorBox error={error} />
      </div>
    </Panel>
  );
}

function DueDiligenceForm({
  request, onSubmit, loading, error,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null }) {
  const [decidedBy, setDecidedBy] = useState("");
  const [justification, setJustification] = useState("");

  return (
    <Panel title="Due Diligence (Privacidade)">
      <div style={{ display: "grid", gap: 10 }}>
        <div>
          <label className="label">Responsável (Privacidade)</label>
          <UserPicker value={decidedBy} onChange={setDecidedBy} role="PRIVACIDADE" />
        </div>
        <div>
          <label className="label">Justificativa</label>
          <input className="input" value={justification} onChange={(e) => setJustification(e.target.value)} />
        </div>
        <ErrorBox error={error} />
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" disabled={loading || !decidedBy} onClick={() => onSubmit(`/api/requests/${request.id}/due-diligence`, "PATCH", { decidedBy, approved: true, justification })}>
            Aprovar
          </button>
          <button className="btn btn-danger" disabled={loading || !decidedBy} onClick={() => onSubmit(`/api/requests/${request.id}/due-diligence`, "PATCH", { decidedBy, approved: false, justification })}>
            Reprovar
          </button>
        </div>
      </div>
    </Panel>
  );
}

function CotacaoForm({
  request, onSubmit, loading, error,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null }) {
  const [actorId, setActorId] = useState(request.buyerId ?? "");
  const [supplierName, setSupplierName] = useState("");
  const [initialValue, setInitialValue] = useState(0);
  const [negotiatedValue, setNegotiatedValue] = useState(0);
  const [paymentCondition, setPaymentCondition] = useState("");

  return (
    <Panel title="Cotação">
      <div style={{ display: "grid", gap: 10 }}>
        {request.quotes.length > 0 && (
          <div style={{ fontSize: 12 }}>
            {request.quotes.map((q) => (
              <div key={q.id} style={{ padding: "6px 0", borderBottom: "1px solid #f0f0f0" }}>
                <strong>{q.supplierName}</strong> — R$ {q.negotiatedValue.toLocaleString("pt-BR")} ({q.paymentCondition})
              </div>
            ))}
          </div>
        )}
        <div>
          <label className="label">Comprador responsável</label>
          <UserPicker value={actorId} onChange={setActorId} role="COMPRADOR" />
        </div>
        <div>
          <label className="label">Fornecedor</label>
          <input className="input" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label className="label">Valor inicial</label>
            <input className="input" type="number" value={initialValue} onChange={(e) => setInitialValue(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Valor negociado</label>
            <input className="input" type="number" value={negotiatedValue} onChange={(e) => setNegotiatedValue(Number(e.target.value))} />
          </div>
        </div>
        <div>
          <label className="label">Condição de pagamento</label>
          <input className="input" value={paymentCondition} onChange={(e) => setPaymentCondition(e.target.value)} />
        </div>
        <ErrorBox error={error} />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn-secondary"
            disabled={loading || !actorId || !supplierName || !paymentCondition}
            onClick={() => {
              onSubmit(`/api/requests/${request.id}/cotacao`, "POST", { addedBy: actorId, supplierName, initialValue, negotiatedValue, paymentCondition });
              setSupplierName(""); setInitialValue(0); setNegotiatedValue(0); setPaymentCondition("");
            }}
          >
            Adicionar cotação
          </button>
          <button className="btn btn-primary" disabled={loading || !actorId} onClick={() => onSubmit(`/api/requests/${request.id}/cotacao`, "PATCH", { actorId })}>
            Avançar para Mapa de Cotação
          </button>
        </div>
      </div>
    </Panel>
  );
}

function MapaCotacaoForm({
  request, onSubmit, loading, error,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null }) {
  const [actorId, setActorId] = useState(request.buyerId ?? "");
  const [selectedQuoteId, setSelectedQuoteId] = useState("");

  return (
    <Panel title="Mapa de Cotação">
      <div style={{ display: "grid", gap: 10 }}>
        {request.quotes.map((q) => {
          const saving = q.initialValue > 0 ? ((q.initialValue - q.negotiatedValue) / q.initialValue) * 100 : 0;
          return (
            <label key={q.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: 8, border: "1px solid #eee", borderRadius: 8 }}>
              <span>
                <input type="radio" name="quote" checked={selectedQuoteId === q.id} onChange={() => setSelectedQuoteId(q.id)} />{" "}
                <strong>{q.supplierName}</strong> — R$ {q.negotiatedValue.toLocaleString("pt-BR")} ({q.paymentCondition})
              </span>
              <span style={{ color: saving >= 0 ? "#25D366" : "#A32D2D", fontWeight: 700 }}>saving {saving.toFixed(1)}%</span>
            </label>
          );
        })}
        <div>
          <label className="label">Comprador responsável</label>
          <UserPicker value={actorId} onChange={setActorId} role="COMPRADOR" />
        </div>
        <ErrorBox error={error} />
        <button className="btn btn-primary" disabled={loading || !actorId || !selectedQuoteId} onClick={() => onSubmit(`/api/requests/${request.id}/mapa-cotacao`, "PATCH", { actorId, selectedQuoteId })}>
          Selecionar vencedor e avançar para Aprovação
        </button>
      </div>
    </Panel>
  );
}

function AprovacaoForm({
  request, onSubmit, loading, error,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null }) {
  const [approverId, setApproverId] = useState("");
  const [approvalId, setApprovalId] = useState("");
  const [justification, setJustification] = useState("");
  const [personifiedBy, setPersonifiedBy] = useState("");
  const [declaredBy, setDeclaredBy] = useState(request.buyerId ?? "");
  const [hasConflict, setHasConflict] = useState(false);
  const [conflictDetails, setConflictDetails] = useState("");

  const hasDeclaration = request.conflictDeclarations.length > 0;
  const latestHasConflict = hasDeclaration && request.conflictDeclarations[0].hasConflict;

  return (
    <Panel title="Aprovação">
      <div style={{ display: "grid", gap: 10 }}>
        {!hasDeclaration || latestHasConflict ? (
          <div style={{ background: "#FFF4D6", borderRadius: 8, padding: 10 }}>
            <p style={{ fontSize: 11, fontWeight: 700, marginBottom: 8 }}>
              Declaração de conflito de interesse obrigatória antes de criar a aprovação.
            </p>
            <label className="label">Quem declara (solicitante ou comprador)</label>
            <UserPicker value={declaredBy} onChange={setDeclaredBy} placeholder="Selecione o declarante" />
            <label style={{ fontSize: 12, display: "block", marginTop: 8 }}>
              <input type="checkbox" checked={hasConflict} onChange={(e) => setHasConflict(e.target.checked)} /> Tenho relação pessoal/familiar/financeira com o fornecedor
            </label>
            {hasConflict && (
              <input className="input" style={{ marginTop: 8 }} placeholder="Detalhe o conflito" value={conflictDetails} onChange={(e) => setConflictDetails(e.target.value)} />
            )}
            <button
              className="btn btn-secondary" style={{ marginTop: 8 }}
              disabled={loading || !declaredBy || (hasConflict && !conflictDetails)}
              onClick={() => onSubmit(`/api/requests/${request.id}/conflito-interesse`, "POST", { declaredBy, hasConflict, details: conflictDetails })}
            >
              Registrar declaração
            </button>
          </div>
        ) : (
          <>
            <div>
              <label className="label">1. Criar aprovação — aprovador</label>
              <div style={{ display: "flex", gap: 8 }}>
                <UserPicker value={approverId} onChange={setApproverId} role="APROVADOR" />
                <button className="btn btn-secondary" disabled={loading || !approverId} onClick={() => onSubmit(`/api/requests/${request.id}/aprovacao`, "POST", { approverId })}>
                  Criar
                </button>
              </div>
            </div>
            <div style={{ borderTop: "1px solid #eee", paddingTop: 10 }}>
              <label className="label">2. Decidir</label>
              <select className="input" value={approvalId} onChange={(e) => setApprovalId(e.target.value)}>
                <option value="">Selecione a aprovação</option>
                {request.approvals.map((a) => (
                  <option key={a.id} value={a.id}>
                    Nível {a.level} · {a.approver.name} · {a.decision}
                  </option>
                ))}
              </select>
              <label className="label" style={{ marginTop: 8 }}>Justificativa</label>
              <input className="input" value={justification} onChange={(e) => setJustification(e.target.value)} />
              <label className="label" style={{ marginTop: 8 }}>
                Personificado por (comprador) — só permitido até R$ 50 mil
              </label>
              <UserPicker value={personifiedBy} onChange={setPersonifiedBy} role="COMPRADOR" placeholder="Nenhum (aprovador real decide)" />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  className="btn btn-primary"
                  disabled={loading || !approvalId}
                  onClick={() =>
                    onSubmit(`/api/requests/${request.id}/aprovacao`, "PATCH", {
                      approvalId, decision: "APROVADO", justification, personifiedBy: personifiedBy || undefined,
                    })
                  }
                >
                  Aprovar
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={loading || !approvalId}
                  onClick={() =>
                    onSubmit(`/api/requests/${request.id}/aprovacao`, "PATCH", {
                      approvalId, decision: "REPROVADO", justification, personifiedBy: personifiedBy || undefined,
                    })
                  }
                >
                  Reprovar
                </button>
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
  request, onSubmit, loading, error,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null }) {
  const [actorId, setActorId] = useState("");
  const [minutaUrl, setMinutaUrl] = useState("");
  const [signedDocUrl, setSignedDocUrl] = useState("");
  const [observations, setObservations] = useState("");

  return (
    <Panel title="Jurídico">
      <div style={{ display: "grid", gap: 10 }}>
        <div>
          <label className="label">Responsável (Jurídico)</label>
          <UserPicker value={actorId} onChange={setActorId} role="JURIDICO" />
        </div>
        <div>
          <label className="label">URL da minuta</label>
          <input className="input" value={minutaUrl} onChange={(e) => setMinutaUrl(e.target.value)} />
        </div>
        <div>
          <label className="label">URL do documento assinado</label>
          <input className="input" value={signedDocUrl} onChange={(e) => setSignedDocUrl(e.target.value)} />
        </div>
        <div>
          <label className="label">Observações</label>
          <input className="input" value={observations} onChange={(e) => setObservations(e.target.value)} />
        </div>
        <ErrorBox error={error} />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn-secondary"
            disabled={loading || !actorId}
            onClick={() => onSubmit(`/api/requests/${request.id}/juridico`, "PATCH", { actorId, minutaUrl, signedDocUrl, observations, signed: false })}
          >
            Salvar minuta (em andamento)
          </button>
          <button
            className="btn btn-primary"
            disabled={loading || !actorId || !signedDocUrl}
            onClick={() => onSubmit(`/api/requests/${request.id}/juridico`, "PATCH", { actorId, minutaUrl, signedDocUrl, observations, signed: true })}
          >
            Marcar como assinado e avançar
          </button>
        </div>
      </div>
    </Panel>
  );
}

type PcItem = { descricao: string; quantidade: number; valorUnitario: number; impostosPercent: number };

const emptyItem = (): PcItem => ({ descricao: "", quantidade: 1, valorUnitario: 0, impostosPercent: 0 });

function PedidoCompraForm({
  request, onSubmit, loading, error,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null }) {
  const winningQuote = request.quotes.find((q) => q.selected);
  const [actorId, setActorId] = useState(request.buyerId ?? "");
  const [supplierId, setSupplierId] = useState("");
  const [supplierLegalName, setSupplierLegalName] = useState(winningQuote?.supplierName ?? "");
  const [supplierCnpj, setSupplierCnpj] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [installments, setInstallments] = useState(1);
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

  return (
    <Panel title="Pedido de Compra">
      <div style={{ display: "grid", gap: 10 }}>
        <div>
          <label className="label">Comprador responsável</label>
          <UserPicker value={actorId} onChange={setActorId} role="COMPRADOR" />
        </div>

        <div>
          <label className="label">Fornecedor cadastrado (opcional)</label>
          <SupplierPicker
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
            <label className="label">Razão social do fornecedor</label>
            <input className="input" value={supplierLegalName} onChange={(e) => setSupplierLegalName(e.target.value)} />
          </div>
          <div>
            <label className="label">CNPJ</label>
            <input className="input" value={supplierCnpj} onChange={(e) => setSupplierCnpj(e.target.value)} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div>
            <label className="label">Contato</label>
            <input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div>
            <label className="label">Telefone</label>
            <input className="input" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          </div>
          <div>
            <label className="label">E-mail</label>
            <input className="input" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Itens (máximo 6)</label>
          <div style={{ display: "grid", gap: 6 }}>
            {items.map((it, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "3fr 1fr 1.2fr 1fr auto", gap: 6 }}>
                <input className="input" placeholder="Descrição" value={it.descricao} onChange={(e) => updateItem(i, { descricao: e.target.value })} />
                <input className="input" type="number" placeholder="Qtd" value={it.quantidade} onChange={(e) => updateItem(i, { quantidade: Number(e.target.value) })} />
                <input className="input" type="number" placeholder="Vlr. unitário" value={it.valorUnitario} onChange={(e) => updateItem(i, { valorUnitario: Number(e.target.value) })} />
                <input className="input" type="number" placeholder="Impostos %" value={it.impostosPercent} onChange={(e) => updateItem(i, { impostosPercent: Number(e.target.value) })} />
                <button
                  className="btn btn-secondary" style={{ padding: "8px 10px" }}
                  disabled={items.length === 1}
                  onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            className="btn btn-secondary" style={{ marginTop: 6 }}
            disabled={items.length >= 6}
            onClick={() => setItems((prev) => [...prev, emptyItem()])}
          >
            + Adicionar item
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label className="label">Prazo de Entrega</label>
            <input className="input" value={prazoEntrega} onChange={(e) => setPrazoEntrega(e.target.value)} placeholder="Ex: 15 dias úteis" />
          </div>
          <div>
            <label className="label">Parcelas</label>
            <input className="input" type="number" value={installments} onChange={(e) => setInstallments(Number(e.target.value))} />
          </div>
        </div>

        <div>
          <label className="label">Local de Entrega / Instruções de Recebimento</label>
          <input className="input" value={localEntrega} onChange={(e) => setLocalEntrega(e.target.value)} placeholder="Endereço e/ou instruções de recebimento" />
        </div>

        <div>
          <label className="label">Frete</label>
          <select className="input" value={frete} onChange={(e) => setFrete(e.target.value as "CIF" | "FOB")}>
            <option value="CIF">CIF</option>
            <option value="FOB">FOB</option>
          </select>
        </div>

        <label style={{ fontSize: 12 }}>
          <input type="checkbox" checked={needsMeasurement} onChange={(e) => setNeedsMeasurement(e.target.checked)} /> Precisa de medição antes da entrega/conclusão
        </label>
        <ErrorBox error={error} />
        <button
          className="btn btn-primary"
          disabled={loading || !actorId || !supplierLegalName || !supplierCnpj || !prazoEntrega || !localEntrega || validItems.length === 0}
          onClick={() =>
            onSubmit(`/api/requests/${request.id}/pedido-compra`, "POST", {
              actorId, supplierId: supplierId || undefined, supplierLegalName, supplierCnpj, contactName, contactPhone, contactEmail,
              initialValue: winningQuote?.initialValue ?? totalValue,
              negotiatedValue: winningQuote?.negotiatedValue ?? totalValue,
              paymentCondition: winningQuote?.paymentCondition ?? "à vista",
              installments, needsMeasurement, prazoEntrega, localEntrega, frete,
              items: validItems.map((it) => ({
                ...it,
                valorTotal: it.quantidade * it.valorUnitario * (1 + it.impostosPercent / 100),
              })),
            })
          }
        >
          Gerar PC
        </button>
      </div>
    </Panel>
  );
}

function AguardandoEntregaForm({
  request, onSubmit, loading, error,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null }) {
  const [actorId, setActorId] = useState(request.buyerId ?? "");

  return (
    <Panel title="Aguardando Entrega/Conclusão">
      <div style={{ display: "grid", gap: 10 }}>
        {request.purchaseOrder?.pdfUrl && (
          <a href={request.purchaseOrder.pdfUrl} target="_blank" style={{ fontSize: 12, color: "#25D366" }}>
            Baixar PDF do Pedido de Compra
          </a>
        )}
        <div>
          <label className="label">Comprador responsável</label>
          <UserPicker value={actorId} onChange={setActorId} role="COMPRADOR" />
        </div>
        <ErrorBox error={error} />
        <button className="btn btn-primary" disabled={loading || !actorId} onClick={() => onSubmit(`/api/requests/${request.id}/aguardando-entrega`, "PATCH", { actorId })}>
          Confirmar entrega/recebimento e avançar
        </button>
      </div>
    </Panel>
  );
}

function MedicaoForm({
  request, onSubmit, loading, error,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null }) {
  const [actorId, setActorId] = useState(request.buyerId ?? "");
  const [scopeExecuted, setScopeExecuted] = useState("");
  const [quantities, setQuantities] = useState("");
  const [reviewComment, setReviewComment] = useState("");

  return (
    <Panel title="Medição e Aprovação Financeira">
      <div style={{ display: "grid", gap: 10 }}>
        <div>
          <label className="label">Comprador responsável</label>
          <UserPicker value={actorId} onChange={setActorId} role="COMPRADOR" />
        </div>
        <div>
          <label className="label">Escopo executado</label>
          <input className="input" value={scopeExecuted} onChange={(e) => setScopeExecuted(e.target.value)} />
        </div>
        <div>
          <label className="label">Quantidades</label>
          <input className="input" value={quantities} onChange={(e) => setQuantities(e.target.value)} />
        </div>
        <div>
          <label className="label">Comentário</label>
          <input className="input" value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} />
        </div>
        <ErrorBox error={error} />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn-primary"
            disabled={loading || !actorId || !scopeExecuted}
            onClick={() => onSubmit(`/api/requests/${request.id}/medicao`, "PATCH", { actorId, scopeExecuted, quantities, reviewComment, technicalApproval: "APROVADO" })}
          >
            Aprovar e avançar para Fiscal
          </button>
          <button
            className="btn btn-secondary"
            disabled={loading || !actorId || !scopeExecuted}
            onClick={() => onSubmit(`/api/requests/${request.id}/medicao`, "PATCH", { actorId, scopeExecuted, quantities, reviewComment, technicalApproval: "REPROVADO" })}
          >
            Registrar reprovação (permanece na etapa)
          </button>
        </div>
      </div>
    </Panel>
  );
}

function FiscalForm({
  request, onSubmit, loading, error,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null }) {
  const [actorId, setActorId] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const [reviewComment, setReviewComment] = useState("");

  return (
    <Panel title="Validação Fiscal">
      <div style={{ display: "grid", gap: 10 }}>
        <div>
          <label className="label">Responsável (Fiscal)</label>
          <UserPicker value={actorId} onChange={setActorId} role="FISCAL" />
        </div>
        <div>
          <label className="label">URL do documento fiscal</label>
          <input className="input" value={documentUrl} onChange={(e) => setDocumentUrl(e.target.value)} />
        </div>
        <div>
          <label className="label">Comentário</label>
          <input className="input" value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} />
        </div>
        <ErrorBox error={error} />
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" disabled={loading || !actorId || !documentUrl} onClick={() => onSubmit(`/api/requests/${request.id}/fiscal`, "PATCH", { actorId, documentUrl, reviewComment, approved: true })}>
            Aprovar e avançar para Tesouraria
          </button>
          <button className="btn btn-danger" disabled={loading || !actorId || !documentUrl} onClick={() => onSubmit(`/api/requests/${request.id}/fiscal`, "PATCH", { actorId, documentUrl, reviewComment, approved: false })}>
            Reprovar
          </button>
        </div>
      </div>
    </Panel>
  );
}

function TesourariaForm({
  request, onSubmit, loading, error,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null }) {
  const [actorId, setActorId] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [paidDate, setPaidDate] = useState("");

  return (
    <Panel title="Tesouraria (Pagamento)">
      <div style={{ display: "grid", gap: 10 }}>
        <div>
          <label className="label">Responsável (Tesouraria)</label>
          <UserPicker value={actorId} onChange={setActorId} role="TESOURARIA" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label className="label">Data programada</label>
            <input className="input" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Data de pagamento</label>
            <input className="input" type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
          </div>
        </div>
        <ErrorBox error={error} />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn-secondary"
            disabled={loading || !actorId}
            onClick={() => onSubmit(`/api/requests/${request.id}/tesouraria`, "PATCH", { actorId, scheduledDate, status: "PROGRAMADO", erpConfirmed: false })}
          >
            Programar pagamento
          </button>
          <button
            className="btn btn-primary"
            disabled={loading || !actorId || !paidDate}
            onClick={() => onSubmit(`/api/requests/${request.id}/tesouraria`, "PATCH", { actorId, scheduledDate, paidDate, status: "PAGO", erpConfirmed: true })}
          >
            Confirmar pagamento no ERP e avançar
          </button>
        </div>
      </div>
    </Panel>
  );
}

function MapeamentoContratoForm({
  request, onSubmit, loading, error,
}: { request: RequestData; onSubmit: Submit; loading: boolean; error: string | null }) {
  const winningQuote = request.quotes.find((q) => q.selected);
  const [actorId, setActorId] = useState(request.buyerId ?? "");
  const [supplierName, setSupplierName] = useState(winningQuote?.supplierName ?? "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [renewalDate, setRenewalDate] = useState("");
  const [contractManagerId, setContractManagerId] = useState(request.buyerId ?? "");
  const [area, setArea] = useState("");
  const [lgpdClause, setLgpdClause] = useState(false);
  const [nonCompete, setNonCompete] = useState(false);

  return (
    <Panel title="Mapeamento de Contrato">
      <div style={{ display: "grid", gap: 10 }}>
        <div>
          <label className="label">Comprador responsável</label>
          <UserPicker value={actorId} onChange={setActorId} role="COMPRADOR" />
        </div>
        <div>
          <label className="label">Fornecedor</label>
          <input className="input" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div>
            <label className="label">Início</label>
            <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Fim</label>
            <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Renovação prevista</label>
            <input className="input" type="date" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label className="label">Gestor do contrato</label>
            <UserPicker value={contractManagerId} onChange={setContractManagerId} />
          </div>
          <div>
            <label className="label">Área</label>
            <input className="input" value={area} onChange={(e) => setArea(e.target.value)} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
          <label><input type="checkbox" checked={lgpdClause} onChange={(e) => setLgpdClause(e.target.checked)} /> Cláusula LGPD</label>
          <label><input type="checkbox" checked={nonCompete} onChange={(e) => setNonCompete(e.target.checked)} /> Não-concorrência</label>
        </div>
        <ErrorBox error={error} />
        <button
          className="btn btn-primary"
          disabled={loading || !actorId || !supplierName || !startDate || !endDate || !renewalDate || !contractManagerId || !area}
          onClick={() =>
            onSubmit(`/api/requests/${request.id}/mapeamento-contrato`, "POST", {
              actorId, supplierName, startDate, endDate, renewalDate, contractManagerId, area, lgpdClause, nonCompete,
            })
          }
        >
          Cadastrar contrato e concluir
        </button>
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
        {request.contract && <a href={`/contratos/${request.contract.id}`} style={{ fontSize: 12, color: "#25D366" }}>Ver contrato mapeado →</a>}
        {request.purchaseOrder && (
          <a href={`/api/requests/${request.id}/pedido-compra/pdf`} target="_blank" style={{ fontSize: 12, color: "#25D366" }}>
            Baixar PDF do Pedido de Compra
          </a>
        )}
        {request.supplierEvaluation ? (
          <p style={{ fontSize: 12, color: "#666" }}>Avaliação (NPS) já registrada. Obrigado!</p>
        ) : (
          <>
            <p style={{ fontSize: 12, color: "#666" }}>Como foi sua experiência com este processo de compra? (0–10)</p>
            <input className="input" type="number" min={0} max={10} value={score} onChange={(e) => setScore(Number(e.target.value))} />
            <input className="input" placeholder="Comentário (opcional)" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
            <ErrorBox error={error} />
            <button className="btn btn-primary" disabled={loading} onClick={() => onSubmit(`/api/requests/${request.id}/avaliacao`, "POST", { score, feedback })}>
              Enviar avaliação
            </button>
          </>
        )}
      </div>
    </Panel>
  );
}
