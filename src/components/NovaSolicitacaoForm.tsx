"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPicker } from "@/components/UserPicker";

type CostCenter = { id: string; name: string };
type BudgetLine = { id: string; description: string; externalCode: string };

// Rótulos idênticos ao formulário Pipefy em produção (https://app.pipefy.com/public/form/a5QZ3k8p),
// incluindo o "Dowgrade" (sem "n") — mantido de propósito para bater com o texto real.
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
  { value: "BAIXA", label: "Baixa" },
  { value: "MEDIA", label: "Média" },
  { value: "ALTA", label: "Alta" },
  { value: "CRITICA", label: "Crítica (Urgência Máxima)" },
];

function Field({ label, help, required, children }: { label: string; help?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="label">
        {label}
        {required && <span style={{ color: "var(--danger)" }}> *</span>}
      </label>
      {help && <p className="help">{help}</p>}
      {children}
    </div>
  );
}

type SessionRequester = { id: string; name: string; email: string } | null;

export function NovaSolicitacaoForm({ sessionRequester = null }: { sessionRequester?: SessionRequester }) {
  const router = useRouter();
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [requesterId, setRequesterId] = useState(sessionRequester?.id ?? "");
  const [costCenterId, setCostCenterId] = useState("");
  const [diretoria, setDiretoria] = useState("TECNOLOGIA");
  const [leadershipPreApproved, setLeadershipPreApproved] = useState<"SIM" | "NAO" | "">("");
  const [approverManagerId, setApproverManagerId] = useState("");
  const [budgetLineId, setBudgetLineId] = useState("");
  const [demandType, setDemandType] = useState("COMPRA_SERVICO");
  const [shortDescription, setShortDescription] = useState("");
  const [longDescription, setLongDescription] = useState("");
  const [priority, setPriority] = useState("MEDIA");
  const [suggestedDeadline, setSuggestedDeadline] = useState("");
  const [indicatedSupplierName, setIndicatedSupplierName] = useState("");
  const [indicatedSupplierPhone, setIndicatedSupplierPhone] = useState("");
  const [indicatedSupplierEmail, setIndicatedSupplierEmail] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [estimatedValue, setEstimatedValue] = useState<number | "">("");
  const [indicatedSupplierWebsite, setIndicatedSupplierWebsite] = useState("");
  const [affectedUsers, setAffectedUsers] = useState("");

  const extraBudgetFileRef = useRef<HTMLInputElement>(null);
  const supplierProposalFileRef = useRef<HTMLInputElement>(null);
  const complementaryFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/cost-centers").then((res) => res.json()).then(setCostCenters).catch(() => setCostCenters([]));
    fetch("/api/budget-lines").then((res) => res.json()).then(setBudgetLines).catch(() => setBudgetLines([]));
  }, []);

  async function uploadIfPresent(requestId: string, ref: React.RefObject<HTMLInputElement>, category: string) {
    const file = ref.current?.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    form.append("uploadedBy", requesterId);
    form.append("category", category);
    await fetch(`/api/requests/${requestId}/attachments`, { method: "POST", body: form });
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
          approverManagerId, budgetLineId, demandType, shortDescription, longDescription,
          priority, suggestedDeadline, indicatedSupplierName, indicatedSupplierPhone, indicatedSupplierEmail,
          quantity, estimatedValue: estimatedValue === "" ? undefined : estimatedValue,
          indicatedSupplierWebsite, affectedUsers: demandType === "FERRAMENTA_USUARIOS" ? affectedUsers : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar solicitação.");

      await Promise.all([
        uploadIfPresent(data.id, extraBudgetFileRef, "APROVACAO_EXTRA_ORCAMENTARIA"),
        uploadIfPresent(data.id, supplierProposalFileRef, "PROPOSTA_FORNECEDOR_INDICADO"),
        uploadIfPresent(data.id, complementaryFileRef, "ANEXO_COMPLEMENTAR"),
      ]);

      router.push(`/solicitacoes/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
      setLoading(false);
    }
  }

  const canSubmit =
    requesterId && costCenterId && leadershipPreApproved && approverManagerId && budgetLineId &&
    shortDescription && longDescription && suggestedDeadline && quantity > 0;

  return (
    <main className="page-narrow" style={{ paddingTop: 28 }}>
      <a href="/solicitacoes" className="back-link">← voltar ao quadro</a>
      <h1 className="page-title" style={{ marginTop: 12 }}>Nova Solicitação de Compra</h1>
      <p className="page-subtitle">Os campos seguem a mesma ordem e os mesmos textos de ajuda do formulário Pipefy, para quem já está acostumado.</p>

      <div className="card section-gap" style={{ display: "grid", gap: 18 }}>
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

        <Field label="Diretoria" required>
          <select className="input" value={diretoria} onChange={(e) => setDiretoria(e.target.value)}>
            <option value="CORPORATIVO">Corporativo</option>
            <option value="REVENUE">Revenue</option>
            <option value="TECNOLOGIA">Tecnologia</option>
          </select>
        </Field>

        <Field label="Solicitação de Compras aprovado pela liderança?" required>
          <div style={{ display: "flex", gap: 20 }}>
            <label className="checkbox-row"><input type="radio" name="leadership" checked={leadershipPreApproved === "SIM"} onChange={() => setLeadershipPreApproved("SIM")} /> Sim</label>
            <label className="checkbox-row"><input type="radio" name="leadership" checked={leadershipPreApproved === "NAO"} onChange={() => setLeadershipPreApproved("NAO")} /> Não</label>
          </div>
        </Field>

        <Field label="Gestor Aprovador do Centro de Custo" required help="Indicar o gestor imediato responsável pela aprovação da despesa.">
          <UserPicker value={approverManagerId} onChange={setApproverManagerId} role="APROVADOR" placeholder="Selecione o gestor aprovador" />
        </Field>

        <Field
          label="Linha do Orçamento"
          required
          help="Indicar o nome da linha do orçamento responsável por absorver essa solicitação de compra."
        >
          <select className="input" value={budgetLineId} onChange={(e) => setBudgetLineId(e.target.value)}>
            <option value="">Selecione</option>
            {budgetLines.map((bl) => (
              <option key={bl.id} value={bl.id}>{bl.description} ({bl.externalCode})</option>
            ))}
          </select>
        </Field>

        <hr className="divider" />

        <Field
          label="Aprovação Extra-orçamentária"
          help="Anexar o e-mail com a validação do diretor imediato e do time de FP&A. Solicitações abertas sem a previsão de orçamento, deverá obrigatoriamente ser anexado o print com a validação do orçamento Extra pelo time de FP&A."
        >
          <input ref={extraBudgetFileRef} type="file" className="input" style={{ padding: 6 }} />
        </Field>

        <Field label="Tipo de Demanda" required help="Indicar qual o tipo de demanda que melhor relata a solicitação gerada.">
          <select className="input" value={demandType} onChange={(e) => setDemandType(e.target.value)}>
            {DEMAND_TYPES.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
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
        </Field>

        <Field
          label="Prioridade de Aquisição"
          required
          help="📌 Classificação de Urgência — 🔴 Crítica (Urgência Máxima) · 🟠 Alta (Urgente, mas não crítica) · 🟡 Média (Importante, mas não urgente) · 🟢 Baixa (Rotineira ou Não Urgente)"
        >
          <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </Field>

        <Field
          label="Data Limite sugerida para entrega do processo"
          required
          help="Informar uma data sugerida para conclusão do processo de compra."
        >
          <input className="input" type="date" value={suggestedDeadline} onChange={(e) => setSuggestedDeadline(e.target.value)} />
        </Field>

        <hr className="divider" />

        <Field label="Fornecedor Indicado" help="Em caso de sugestão de fornecedor indicar o nome do fornecedor, e os contatos comerciais.">
          <input className="input" value={indicatedSupplierName} onChange={(e) => setIndicatedSupplierName(e.target.value)} />
        </Field>

        <Field label="Contato do Fornecedor" help="Informar o número de telefone do fornecedor, nos casos de fornecedor indicado pelo solicitante.">
          <input className="input" value={indicatedSupplierPhone} onChange={(e) => setIndicatedSupplierPhone(e.target.value)} placeholder="+55 ..." />
        </Field>

        <Field label="E-mail do Fornecedor" help="Informar o e-mail do fornecedor em caso de indicação de fornecedor.">
          <input className="input" value={indicatedSupplierEmail} onChange={(e) => setIndicatedSupplierEmail(e.target.value)} />
        </Field>

        <Field label="Proposta do Fornecedor indicado" help="Anexar a proposta inicial elaborado pelo fornecedor indicado.">
          <input ref={supplierProposalFileRef} type="file" className="input" style={{ padding: 6 }} />
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

        <Field label="Site do fornecedor" help="Caso tenha um fornecedor indicado, informar o site.">
          <input className="input" value={indicatedSupplierWebsite} onChange={(e) => setIndicatedSupplierWebsite(e.target.value)} />
        </Field>

        <Field label="Anexo complementar">
          <input ref={complementaryFileRef} type="file" className="input" style={{ padding: 6 }} />
        </Field>

        {demandType === "FERRAMENTA_USUARIOS" && (
          <Field label="Usuários" help="Informar o nome e e-mail em casos de adição ou remoção de usuário(s).">
            <input className="input" value={affectedUsers} onChange={(e) => setAffectedUsers(e.target.value)} />
          </Field>
        )}

        {error && <p style={{ fontSize: 12.5, color: "var(--danger)", margin: 0 }}>{error}</p>}

        <div>
          <button className="btn btn-primary" style={{ padding: "10px 22px", fontSize: 13.5 }} disabled={loading || !canSubmit} onClick={submit}>
            {loading ? "Enviando…" : "Enviar"}
          </button>
        </div>
      </div>
    </main>
  );
}
