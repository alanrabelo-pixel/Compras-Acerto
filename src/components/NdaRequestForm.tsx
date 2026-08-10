"use client";

import { useState } from "react";
import { UserPicker, type UserOption } from "@/components/UserPicker";
import { SupplierPicker } from "@/components/SupplierPicker";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";
import { AlertTriangle } from "lucide-react";

type SessionRequester = { id: string; name: string; email: string } | null;

/**
 * Tela de Solicitação de Envio de NDA — deliberadamente enxuta (só o que o
 * jurídico/comprador realmente precisa para redigir e enviar o termo): quem
 * pede, o contexto da negociação, e opcionalmente os dados de contato do
 * fornecedor. Sem alçada, sem etapas — usa o mesmo trilho simples de
 * Viagens/Facilities (SimpleTicket), só com um formulário de entrada próprio.
 */
export function NdaRequestForm({ sessionRequester = null }: { sessionRequester?: SessionRequester }) {
  const [manualRequester, setManualRequester] = useState<{ id: string; name: string; email: string } | null>(null);
  const requesterName = sessionRequester?.name ?? manualRequester?.name ?? "";
  const requesterEmail = sessionRequester?.email ?? manualRequester?.email ?? "";

  const [description, setDescription] = useState("");

  const [supplierName, setSupplierName] = useState("");
  const [supplierContactName, setSupplierContactName] = useState("");
  const [supplierContactRole, setSupplierContactRole] = useState("");
  const [supplierContactEmail, setSupplierContactEmail] = useState("");
  const [supplierContactPhone, setSupplierContactPhone] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; code: string } | null>(null);

  const canSubmit = requesterName.trim() && requesterEmail.trim() && description.trim().length >= 10;

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "nda", requesterName, requesterEmail, description,
          supplierName, supplierContactName, supplierContactRole, supplierContactEmail, supplierContactPhone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível enviar a solicitação.");
      setResult({ id: data.id, code: data.code });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado — tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <Card className="section-gap">
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <span
            aria-hidden
            style={{
              width: 40, height: 40, borderRadius: "50%", background: "var(--acerto-green-50)",
              color: "var(--acerto-green-dark)", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, flexShrink: 0,
            }}
          >
            ✓
          </span>
          <div>
            <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700 }}>Solicitação enviada com sucesso!</h2>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-muted)", lineHeight: 1.5 }}>
              Sua solicitação de NDA <strong style={{ color: "var(--acerto-green-dark)" }}>{result.code}</strong> foi
              registrada e já está disponível para acompanhamento. Você receberá um e-mail de confirmação em breve.
            </p>
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <Button variant="primary" onClick={() => (window.location.href = `/chamados/nda/${result.id}`)}>
                Acompanhar solicitação →
              </Button>
              <Button variant="secondary" onClick={() => (window.location.href = "/")}>Voltar ao início</Button>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="section-gap" style={{ display: "grid", gap: 18 }}>
      <div className="form-section">
        <p className="form-section-label">Solicitante</p>
        {sessionRequester ? (
          <p style={{ fontSize: 12.5, margin: 0 }}>
            {sessionRequester.name} <span style={{ color: "var(--ink-muted)" }}>({sessionRequester.email})</span>
          </p>
        ) : (
          <Field label="Quem está solicitando" required help="Sessão local sem SSO ativo — selecione quem está abrindo esta solicitação.">
            <UserPicker
              value={manualRequester?.id ?? ""}
              onChange={() => {}}
              onSelect={(u: UserOption) => setManualRequester({ id: u.id, name: u.name, email: u.email })}
              placeholder="Selecione quem está solicitando"
            />
          </Field>
        )}
      </div>

      <div className="form-section">
        <Field
          label="Descrição detalhada"
          required
          help="Descreva o motivo do envio do NDA, o contexto da negociação, o objetivo do compartilhamento de informações e qualquer detalhe relevante."
        >
          <Textarea
            style={{ minHeight: 140, resize: "vertical" }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: Estamos negociando uma parceria com o fornecedor X para o projeto Y e precisamos compartilhar informações confidenciais antes de formalizar o contrato."
          />
        </Field>
      </div>

      <div className="form-section">
        <p className="form-section-label">Contatos do fornecedor <span style={{ fontWeight: 400, color: "var(--ink-muted)" }}>(opcional)</span></p>
        <p className="help" style={{ marginTop: -4 }}>
          Preencha se já souber com quem o NDA será compartilhado — ajuda o jurídico a agilizar o envio. Pode deixar em branco e completar depois.
        </p>

        <Field label="Fornecedor cadastrado (opcional)" help="Se o fornecedor já tiver cadastro, selecione para preencher automaticamente.">
          <SupplierPicker
            onSelect={(s) => {
              setSupplierName(s.legalName);
              setSupplierContactName(s.contactName ?? "");
              setSupplierContactEmail(s.contactEmail ?? "");
              setSupplierContactPhone(s.contactPhone ?? "");
            }}
          />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Nome do fornecedor">
            <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Razão social ou nome fantasia" />
          </Field>
          <Field label="Nome do contato">
            <Input value={supplierContactName} onChange={(e) => setSupplierContactName(e.target.value)} />
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Field label="Cargo">
            <Input value={supplierContactRole} onChange={(e) => setSupplierContactRole(e.target.value)} placeholder="Ex: Gerente Comercial" />
          </Field>
          <Field label="E-mail">
            <Input type="email" value={supplierContactEmail} onChange={(e) => setSupplierContactEmail(e.target.value)} />
          </Field>
          <Field label="Telefone">
            <Input value={supplierContactPhone} onChange={(e) => setSupplierContactPhone(e.target.value)} placeholder="+55 ..." />
          </Field>
        </div>
      </div>

      {error && (
        <p role="alert" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--danger)", background: "var(--danger-bg)", border: "1px solid #f8b4ac", borderRadius: 8, padding: "10px 12px", margin: 0 }}>
          <AlertTriangle size={14} strokeWidth={1.75} aria-hidden /> {error}
        </p>
      )}

      <div>
        <Button variant="primary" disabled={loading || !canSubmit} onClick={submit}>
          {loading ? "Enviando…" : "Enviar solicitação"}
        </Button>
        {!canSubmit && description.length > 0 && description.trim().length < 10 && (
          <p className="help" style={{ marginTop: 6 }}>A descrição precisa ter pelo menos 10 caracteres.</p>
        )}
      </div>
    </Card>
  );
}
