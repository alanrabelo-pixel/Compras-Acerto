"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPicker } from "@/components/UserPicker";
import { Button, Field, AiTag, WarningNotice } from "@/components/ui";
import { AiKeySettings } from "@/components/AiKeySettings";

type CostCenter = { id: string; name: string; managers: { name: string }[] };

// Sentinelas do <select> de Linha do Orçamento. Hoje é um campo manual (sem
// integração com a base de orçamento), então só existem 2 escolhas reais:
// Orçamento Extra (anexo obrigatório) ou Outros (texto livre, ver budgetLineText).
const EXTRA_BUDGET = "ORCAMENTO_EXTRA";
const OTHER_BUDGET = "OUTROS";

// Conta dias úteis (seg-sex, sem calendário de feriados) entre hoje e a data
// informada. Usado só pro alerta de prazo apertado, não afeta o valor salvo.
function countBusinessDaysUntil(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (target <= today) return 0;
  let count = 0;
  const cur = new Date(today);
  while (cur < target) {
    cur.setDate(cur.getDate() + 1);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

// Rótulos mantidos estáveis, inclusive o "Dowgrade" (sem "n"), de propósito,
// para não conflitar com o texto já usado em solicitações antigas.
const DEMAND_TYPES = [
  { value: "COMPRA_PRODUTO", label: "Compra de Produtos" },
  { value: "COMPRA_SERVICO", label: "Compra de Serviço" },
  { value: "FERRAMENTA_NOVA", label: "Compra de Nova Ferramenta" },
  { value: "FERRAMENTA_USUARIOS", label: "Compra de Ferramentas - Inclusão ou remoção de usuários" },
  { value: "FERRAMENTA_UPGRADE_DOWNGRADE", label: "Compra de Ferramentas - Upgrade ou Dowgrade de versão" },
  { value: "RENOVACAO_CONTRATO", label: "Renovação de Contrato Existente" },
  { value: "CANCELAMENTO", label: "Cancelamento de Contrato, Serviços e Ferramentas" },
];

const PRIORITIES = [
  { value: "BAIXA", label: "Baixa (Rotineira)" },
  { value: "MEDIA", label: "Média (Importante)" },
  { value: "ALTA", label: "Alta (Urgente)" },
  { value: "CRITICA", label: "Crítica (Urgência Máxima)" },
];

type SessionRequester = { id: string; name: string; email: string } | null;

/**
 * Contrato que originou esta solicitação, quando a pessoa chegou pelo link do
 * e-mail de alerta de renovação. Antes esse link levava a um formulário em
 * branco: o parâmetro existia na URL e não era lido em lugar nenhum.
 */
type ContratoDeOrigem = {
  id: string;
  fornecedor: string;
  objeto: string | null;
  centroDeCusto: string;
  diretoria: string | null;
  fimDaVigencia: string;
} | null;

export function NovaSolicitacaoForm({
  sessionRequester = null,
  contratoDeOrigem = null,
}: {
  sessionRequester?: SessionRequester;
  contratoDeOrigem?: ContratoDeOrigem;
}) {
  const router = useRouter();
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Preenchido quando a solicitação já foi criada mas o anexo obrigatório de
  // Orçamento Extra falhou ao enviar. Evita navegar como se tivesse dado
  // tudo certo, deixando a pessoa anexar manualmente na página da solicitação.
  const [createdRequestId, setCreatedRequestId] = useState<string | null>(null);

  const [requesterId, setRequesterId] = useState(sessionRequester?.id ?? "");
  const [costCenterId, setCostCenterId] = useState("");
  const [diretoria, setDiretoria] = useState(contratoDeOrigem?.diretoria ?? "TECNOLOGIA");
  const [leadershipPreApproved, setLeadershipPreApproved] = useState<"SIM" | "NAO" | "">("");
  const [budgetLineChoice, setBudgetLineChoice] = useState("");
  const [budgetLineText, setBudgetLineText] = useState("");
  const [demandType, setDemandType] = useState(contratoDeOrigem ? "RENOVACAO_CONTRATO" : "COMPRA_SERVICO");
  const [shortDescription, setShortDescription] = useState(
    contratoDeOrigem ? `Renovação de contrato: ${contratoDeOrigem.fornecedor}` : ""
  );
  const [longDescription, setLongDescription] = useState(
    contratoDeOrigem
      ? [
          `Renovação do contrato com ${contratoDeOrigem.fornecedor}, com vigência até ${new Date(contratoDeOrigem.fimDaVigencia).toLocaleDateString("pt-BR")}.`,
          contratoDeOrigem.objeto ? `Objeto do contrato atual: ${contratoDeOrigem.objeto}` : null,
        ]
          .filter(Boolean)
          .join("\n\n")
      : ""
  );
  const [priority, setPriority] = useState("MEDIA");
  const [suggestedDeadline, setSuggestedDeadline] = useState("");
  const [indicatedSupplierName, setIndicatedSupplierName] = useState(contratoDeOrigem?.fornecedor ?? "");
  const [indicatedSupplierPhone, setIndicatedSupplierPhone] = useState("");
  const [indicatedSupplierEmail, setIndicatedSupplierEmail] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [estimatedValue, setEstimatedValue] = useState<number | "">("");
  const [indicatedSupplierWebsite, setIndicatedSupplierWebsite] = useState("");
  const [affectedUsers, setAffectedUsers] = useState("");

  const [extraBudgetFileSelected, setExtraBudgetFileSelected] = useState(false);
  const isExtraBudget = budgetLineChoice === EXTRA_BUDGET;
  const isOtherBudget = budgetLineChoice === OTHER_BUDGET;

  // Assistente de preenchimento (Fase 1 de IA). Lê a Descrição Detalhada já
  // digitada e sugere demandType/priority + um alerta antecipado de
  // Due Diligence. Nunca preenche sozinho sem clique, e cada campo alterado
  // continua editável normalmente. Só marcamos quais vieram de sugestão.
  const [assisting, setAssisting] = useState(false);
  const [assistError, setAssistError] = useState<string | null>(null);
  const [assistNote, setAssistNote] = useState<{ note: string; missingInfo: string[]; likelyDueDiligence: boolean } | null>(null);
  const [aiSuggestedFields, setAiSuggestedFields] = useState<Set<string>>(new Set());

  async function requestAssist() {
    setAssisting(true);
    setAssistError(null);
    try {
      const res = await fetch("/api/requests/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requesterId, description: longDescription }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível gerar sugestões.");
      const applied = new Set<string>();
      if (data.demandType) { setDemandType(data.demandType); applied.add("demandType"); }
      if (data.priority) { setPriority(data.priority); applied.add("priority"); }
      setAiSuggestedFields(applied);
      setAssistNote({ note: data.note, missingInfo: data.missingInfo ?? [], likelyDueDiligence: Boolean(data.likelyDueDiligence) });
    } catch (e) {
      setAssistError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setAssisting(false);
    }
  }

  const extraBudgetFileRef = useRef<HTMLInputElement>(null);
  const supplierProposalFileRef = useRef<HTMLInputElement>(null);
  const complementaryFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/cost-centers")
      .then((res) => res.json())
      .then((lista: CostCenter[]) => {
        setCostCenters(lista);
        // O contrato guarda o centro de custo como texto livre, não como id,
        // então a correspondência é por nome. Não achando, deixa em branco
        // para a pessoa escolher, em vez de chutar um centro de custo errado
        // numa solicitação que vai definir quem aprova.
        if (contratoDeOrigem && !costCenterId) {
          const correspondente = lista.find(
            (cc) => cc.name.trim().toLowerCase() === contratoDeOrigem.centroDeCusto.trim().toLowerCase()
          );
          if (correspondente) setCostCenterId(correspondente.id);
        }
      })
      .catch(() => setCostCenters([]));
  }, []);

  async function uploadIfPresent(requestId: string, ref: React.RefObject<HTMLInputElement>, category: string) {
    const file = ref.current?.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    form.append("uploadedBy", requesterId);
    form.append("category", category);
    const res = await fetch(`/api/requests/${requestId}/attachments`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`Falha ao anexar arquivo (categoria: ${category}).`);
  }

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesterId, costCenterId, diretoria,
          leadershipPreApproved: leadershipPreApproved === "SIM",
          budgetLineText: isExtraBudget ? undefined : (budgetLineText || undefined),
          extraBudget: isExtraBudget,
          demandType, shortDescription, longDescription,
          priority, suggestedDeadline, indicatedSupplierName, indicatedSupplierPhone, indicatedSupplierEmail,
          quantity, estimatedValue: estimatedValue === "" ? undefined : estimatedValue,
          indicatedSupplierWebsite, affectedUsers: demandType === "FERRAMENTA_USUARIOS" ? affectedUsers : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar solicitação.");

      // Anexo de Orçamento Extra é obrigatório quando isExtraBudget. Se o
      // upload falhar aqui, a solicitação já foi criada sem o anexo exigido;
      // avisamos e paramos, em vez de navegar como se tivesse dado tudo
      // certo (o anexo pode ser enviado manualmente na página da solicitação).
      if (isExtraBudget) {
        try {
          await uploadIfPresent(data.id, extraBudgetFileRef, "APROVACAO_EXTRA_ORCAMENTARIA");
        } catch {
          setError("A solicitação foi criada, mas o anexo obrigatório de Aprovação Extra-orçamentária falhou ao enviar. Abra a solicitação abaixo e anexe manualmente.");
          setCreatedRequestId(data.id);
          setLoading(false);
          return;
        }
      } else {
        await uploadIfPresent(data.id, extraBudgetFileRef, "APROVACAO_EXTRA_ORCAMENTARIA").catch(() => {});
      }

      await Promise.all([
        uploadIfPresent(data.id, supplierProposalFileRef, "PROPOSTA_FORNECEDOR_INDICADO").catch(() => {}),
        uploadIfPresent(data.id, complementaryFileRef, "ANEXO_COMPLEMENTAR").catch(() => {}),
      ]);

      router.push(`/solicitacoes/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
      setLoading(false);
    }
  }

  const canSubmit =
    requesterId && costCenterId && leadershipPreApproved && budgetLineChoice &&
    shortDescription && longDescription && suggestedDeadline && quantity > 0 &&
    (!isExtraBudget || extraBudgetFileSelected) &&
    (!isOtherBudget || budgetLineText.trim());

  return (
    <main className="page-narrow" style={{ paddingTop: 28 }}>
      <div className="form-brand-block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/acerto-logo.svg" alt="Acerto" className="form-brand-acerto" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/alai-logo.svg" alt="alAi" className="form-brand-alai" />
      </div>
      <a href="/solicitacoes" className="back-link">← voltar ao quadro</a>
      <h1 className="page-title" style={{ marginTop: 12 }}>Solicitação de Compra</h1>

      {contratoDeOrigem && (
        <p
          className="section-gap"
          style={{
            fontSize: 12.5,
            color: "var(--acerto-green-dark)",
            background: "rgba(37,211,102,0.08)",
            border: "1px solid var(--acerto-green)",
            borderRadius: 4,
            padding: "9px 12px",
            margin: 0,
          }}
          role="status"
        >
          Preenchemos o que dava a partir do contrato com <strong>{contratoDeOrigem.fornecedor}</strong>, que vence
          em {new Date(contratoDeOrigem.fimDaVigencia).toLocaleDateString("pt-BR")}. Confira e ajuste o que for
          preciso antes de enviar.
        </p>
      )}

      <div className="card section-gap" style={{ display: "grid", gap: 18 }}>
        <div className="form-section">
          <p className="form-section-label">Solicitante</p>

          <Field label="Nome do Solicitante / E-mail do Solicitante" required>
            {sessionRequester ? (
              <div className="input" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface-muted)", color: "var(--ink-soft)" }}>
                <span>{sessionRequester.name} ({sessionRequester.email})</span>
                <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>preenchido pela sua conta</span>
              </div>
            ) : (
              <UserPicker value={requesterId} onChange={setRequesterId} placeholder="Selecione o solicitante" />
            )}
          </Field>

          <Field
            label="Centro de Custo Gerencial"
            required
            help="Centro de custo é uma nomenclatura financeira, dentro da empresa, gerenciada por uma liderança e usado para controlar e organizar gastos."
          >
            <select className="input" value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)}>
              <option value="">Selecione</option>
              {costCenters.map((cc) => (
                <option key={cc.id} value={cc.id}>{cc.name}</option>
              ))}
            </select>
          </Field>

          {costCenterId && (() => {
            const selected = costCenters.find((cc) => cc.id === costCenterId);
            const names = selected?.managers.map((m) => m.name) ?? [];
            return (
              <p style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: -4 }}>
                {names.length > 0
                  ? <>Gestor{names.length > 1 ? "es" : ""} deste centro de custo: <strong>{names.join(", ")}</strong>. Será{names.length > 1 ? "ão" : ""} notificado{names.length > 1 ? "s" : ""} automaticamente ao enviar.</>
                  : "Este centro de custo ainda não tem gestor definido. A solicitação segue normalmente para a Triagem; só não haverá quem avisar sobre ela."}
              </p>
            );
          })()}

          <Field label="Diretoria" required>
            <select className="input" value={diretoria} onChange={(e) => setDiretoria(e.target.value)}>
              <option value="CORPORATIVO">Corporativo</option>
              <option value="REVENUE">Revenue</option>
              <option value="TECNOLOGIA">Tecnologia</option>
            </select>
          </Field>

          <Field label="Solicitação de Compra alinhada com a liderança?" required>
            <div style={{ display: "flex", gap: 20 }}>
              <label className="checkbox-row"><input type="radio" name="leadership" checked={leadershipPreApproved === "SIM"} onChange={() => setLeadershipPreApproved("SIM")} /> Sim</label>
              <label className="checkbox-row"><input type="radio" name="leadership" checked={leadershipPreApproved === "NAO"} onChange={() => setLeadershipPreApproved("NAO")} /> Não</label>
            </div>
            {leadershipPreApproved === "NAO" && (
              <WarningNotice className="section-gap">
                Sem alinhamento prévio, a solicitação tem mais chance de ser devolvida na etapa de Aprovação. Se der, alinhe com a liderança antes de enviar.
              </WarningNotice>
            )}
          </Field>

        </div>

        <div className="form-section">
          <p className="form-section-label">Orçamento</p>

          <Field
            label="Linha do Orçamento"
            required
            help="Indicar o nome da linha do orçamento responsável por absorver essa solicitação de compra."
          >
            <select className="input" value={budgetLineChoice} onChange={(e) => setBudgetLineChoice(e.target.value)}>
              <option value="">Selecione</option>
              <option value={EXTRA_BUDGET}>Orçamento Extra</option>
              <option value={OTHER_BUDGET}>Outros</option>
            </select>
            {isOtherBudget && (
              <>
                <input
                  className="input"
                  style={{ marginTop: 8 }}
                  placeholder="Digite o nome da linha do orçamento"
                  value={budgetLineText}
                  onChange={(e) => setBudgetLineText(e.target.value)}
                />
                <WarningNotice className="section-gap">
                  Confirme se esta é a linha de orçamento correta e se ela possui saldo disponível para esta aquisição.
                </WarningNotice>
              </>
            )}
            {isExtraBudget && (
              <WarningNotice className="section-gap">
                Orçamento Extra exige anexo obrigatório: o print da validação do orçamento pelo time de FP&A, no campo logo abaixo.
              </WarningNotice>
            )}
          </Field>

          <Field
            label="Aprovação Extra-orçamentária"
            required={isExtraBudget}
            help={
              isExtraBudget
                ? "Obrigatório: você selecionou \"Orçamento Extra\" acima. Anexe o e-mail com a validação do diretor imediato e do time de FP&A."
                : "Anexar o e-mail com a validação do diretor imediato e do time de FP&A. Solicitações abertas sem a previsão de orçamento deverão ter obrigatoriamente anexado o print com a validação do orçamento Extra pelo time de FP&A."
            }
          >
            <input
              ref={extraBudgetFileRef} type="file" className="input" style={{ padding: 6 }}
              onChange={() => setExtraBudgetFileSelected(Boolean(extraBudgetFileRef.current?.files?.length))}
            />
          </Field>
        </div>

        <div className="form-section">
          <p className="form-section-label">Detalhes da demanda</p>

          <Field label="Tipo de Demanda" required help="Indicar qual o tipo de demanda que melhor relata a solicitação gerada.">
            <select className="input" value={demandType} onChange={(e) => { setDemandType(e.target.value); setAiSuggestedFields((prev) => { const next = new Set(prev); next.delete("demandType"); return next; }); }}>
              {DEMAND_TYPES.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
            {aiSuggestedFields.has("demandType") && <div style={{ marginTop: 4 }}><AiTag /></div>}
          </Field>

          <Field
            label="Descrição Resumida da Demanda"
            required
            help="Informar a descrição resumida da demanda, visando facilitar a pesquisa do processo pela descrição informada."
          >
            <input className="input" value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} />
          </Field>

          <Field label="Descrição Detalhada da Demanda" required help="Informar de forma detalhada o que é, pra que serve, e porque.">
            <textarea
              className="input"
              style={{ minHeight: 90, resize: "vertical" }}
              value={longDescription}
              onChange={(e) => setLongDescription(e.target.value)}
            />
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <Button
                variant="secondary"
                style={{ fontSize: 11.5, padding: "5px 10px", display: "inline-flex", alignItems: "center", gap: 5 }}
                disabled={assisting || !requesterId || longDescription.trim().length < 10}
                onClick={requestAssist}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/alai-mark.svg" alt="" aria-hidden className="ai-assist-mark" />
                {assisting ? "Analisando..." : "Sugerir com IA"}
              </Button>
              {!requesterId && <span className="help" style={{ margin: 0 }}>Selecione o solicitante acima para usar o assistente.</span>}
            </div>
            {requesterId && <div style={{ marginTop: 6 }}><AiKeySettings actorId={requesterId} /></div>}
            {assistError && <p style={{ fontSize: 11.5, color: "var(--danger)", marginTop: 4 }}>{assistError}</p>}
            {assistNote && (
              <div className="hint-box hint-box-neutral" style={{ marginTop: 8, display: "grid", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/brand/alai-mark.svg" alt="" aria-hidden className="ai-assist-mark ai-assist-mark-lg" />
                  <AiTag />
                </div>
                <p style={{ margin: 0 }}>{assistNote.note}</p>
                {assistNote.missingInfo.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {assistNote.missingInfo.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                )}
                {assistNote.likelyDueDiligence && (
                  <p style={{ margin: 0, fontWeight: 600, color: "var(--warning)" }}>
                    Provavelmente vai passar por Due Diligence de Privacidade. Parece uma ferramenta nova que trata dado pessoal.
                  </p>
                )}
              </div>
            )}
          </Field>

          <Field
            label="Prioridade de Aquisição"
            required
            help="Classificação de Urgência: Crítica (Urgência Máxima) · Alta (Urgente, mas não crítica) · Média (Importante, mas não urgente) · Baixa (Rotineira ou Não Urgente)"
          >
            <select className="input" value={priority} onChange={(e) => { setPriority(e.target.value); setAiSuggestedFields((prev) => { const next = new Set(prev); next.delete("priority"); return next; }); }}>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            {aiSuggestedFields.has("priority") && <div style={{ marginTop: 4 }}><AiTag /></div>}
            {(priority === "ALTA" || priority === "CRITICA") && (
              <WarningNotice className="section-gap">
                Prioridades altas têm custo: geram fila fora de ordem e podem pressionar prazos de outras solicitações. Confirma que essa é mesmo uma urgência real?
              </WarningNotice>
            )}
          </Field>

          <Field
            label="Data Limite sugerida para entrega do processo"
            required
            help="Informar uma data sugerida para conclusão do processo de compra."
          >
            <input className="input" type="date" value={suggestedDeadline} onChange={(e) => setSuggestedDeadline(e.target.value)} />
            {suggestedDeadline && countBusinessDaysUntil(suggestedDeadline) < 7 && (
              <WarningNotice className="section-gap">
                Prazo com menos de 7 dias úteis. Cotação, aprovação e emissão do pedido levam tempo, e esse prazo pode não ser cumprido. Avalie se dá para ampliar a data.
              </WarningNotice>
            )}
          </Field>

          <Field
            label="Quantidade a ser Adquirida"
            required
            help="Informar a quantidade a ser adquirido pelo time de Compras. Quando serviço geralmente a quantidade é 1."
          >
            <input className="input" type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
          </Field>

          <Field label="Valor Estimado em R$" help="Caso tenha o valor estimado, informar nesse campo.">
            <input
              className="input"
              type="number"
              min={0}
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </Field>

          <Field label="Anexo complementar">
            <input ref={complementaryFileRef} type="file" className="input" style={{ padding: 6 }} />
          </Field>

          {demandType === "FERRAMENTA_USUARIOS" && (
            <Field label="Usuários" help="Informar o nome e e-mail em casos de adição ou remoção de usuário(s).">
              <input className="input" value={affectedUsers} onChange={(e) => setAffectedUsers(e.target.value)} />
            </Field>
          )}
        </div>

        <div className="form-section">
          <p className="form-section-label">Fornecedor</p>

          <Field label="Fornecedor Indicado" help="Em caso de sugestão de fornecedor indicar o nome do fornecedor, e os contatos comerciais.">
            <input className="input" value={indicatedSupplierName} onChange={(e) => setIndicatedSupplierName(e.target.value)} />
          </Field>

          <Field label="Contato do Fornecedor" help="Informar o número de telefone do fornecedor, nos casos de fornecedor indicado pelo solicitante.">
            <input className="input" value={indicatedSupplierPhone} onChange={(e) => setIndicatedSupplierPhone(e.target.value)} placeholder="+55 ..." />
          </Field>

          <Field label="E-mail do Fornecedor" help="Informar o e-mail do fornecedor em caso de indicação de fornecedor.">
            <input className="input" value={indicatedSupplierEmail} onChange={(e) => setIndicatedSupplierEmail(e.target.value)} />
          </Field>

          <Field label="Site do fornecedor" help="Caso tenha um fornecedor indicado, informar o site.">
            <input className="input" value={indicatedSupplierWebsite} onChange={(e) => setIndicatedSupplierWebsite(e.target.value)} />
          </Field>

          <Field label="Proposta do Fornecedor indicado" help="Anexar a proposta inicial elaborado pelo fornecedor indicado.">
            <input ref={supplierProposalFileRef} type="file" className="input" style={{ padding: 6 }} />
          </Field>
        </div>

        {error && <p style={{ fontSize: 12.5, color: "var(--danger)", margin: 0 }}>{error}</p>}
        {createdRequestId && (
          <a href={`/solicitacoes/${createdRequestId}`} style={{ fontSize: 12.5, color: "var(--acerto-green-dark)", fontWeight: 600 }}>
            Abrir solicitação criada →
          </a>
        )}

        <div>
          <Button variant="primary" style={{ padding: "10px 22px", fontSize: 13.5 }} disabled={loading || !canSubmit} onClick={submit}>
            {loading ? "Enviando…" : "Enviar"}
          </Button>
        </div>
      </div>
    </main>
  );
}
