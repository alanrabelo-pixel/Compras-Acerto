"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TICKET_STATUS_LABEL } from "@/lib/tickets";

type Message = { id: string; authorName: string; body: string; createdAt: string };

export function ChamadoThread({
  ticketId, messages, status, canChangeStatus = true, devUserId,
}: { ticketId: string; messages: Message[]; status: string; canChangeStatus?: boolean; devUserId?: string }) {
  const router = useRouter();
  const [authorName, setAuthorName] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // `devUserId` (?userId= na URL) só existe em modo bypass local, pra
  // pré-visualizar a visão de um Solicitante puro sem SSO real, repassado
  // aqui pra que a API (src/app/api/tickets/[id]/...) valide a mesma
  // identidade simulada, em vez de sempre cair no admin padrão do bypass.
  // Fora do bypass, a API ignora esse parâmetro e usa só a sessão real.
  const devQuery = devUserId ? `?userId=${devUserId}` : "";

  async function sendMessage() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/messages${devQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorName, body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao enviar mensagem.");
      setBody("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(newStatus: string) {
    setStatusLoading(true);
    try {
      await fetch(`/api/tickets/${ticketId}${devQuery}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      router.refresh();
    } finally {
      setStatusLoading(false);
    }
  }

  return (
    <>
      <section className="card section-gap">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className="card-title accent" style={{ margin: 0 }}>Status</h2>
          {canChangeStatus ? (
            <select
              className="input"
              style={{ width: "auto" }}
              value={status}
              disabled={statusLoading}
              onChange={(e) => changeStatus(e.target.value)}
            >
              {Object.entries(TICKET_STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          ) : (
            <span className="badge badge-neutral">{TICKET_STATUS_LABEL[status] ?? status}</span>
          )}
        </div>
      </section>

      <section className="card section-gap">
        <h2 className="card-title accent">Histórico de mensagens</h2>
        {messages.length === 0 && <p style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Nenhuma mensagem ainda. Escreva abaixo para falar com quem abriu o chamado.</p>}
        <div style={{ display: "grid", gap: 10 }}>
          {messages.map((m) => (
            <div key={m.id} style={{ background: "var(--surface-muted)", borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 4 }}>
                <span style={{ fontWeight: 700 }}>{m.authorName}</span>
                <span className="text-muted">{new Date(m.createdAt).toLocaleString("pt-BR")}</span>
              </div>
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.body}</p>
            </div>
          ))}
        </div>

        <hr className="divider" />

        <div style={{ display: "grid", gap: 10 }}>
          <div className="field">
            <label className="label">Seu nome</label>
            <input className="input" value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="Ex: Time de Facilities, ou seu próprio nome" />
          </div>
          <div className="field">
            <label className="label">Mensagem</label>
            <textarea className="input" style={{ minHeight: 80, resize: "vertical" }} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          {error && <p style={{ fontSize: 12, color: "var(--danger)" }}>{error}</p>}
          <div>
            <button className="btn btn-primary" disabled={loading || !authorName || !body} onClick={sendMessage}>
              {loading ? "Enviando…" : "Enviar mensagem"}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
