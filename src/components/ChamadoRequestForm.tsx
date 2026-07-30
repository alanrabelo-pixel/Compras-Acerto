"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TicketCategorySlug } from "@/lib/tickets";

/**
 * Formulário genérico de abertura de chamado simples (Viagens/Facilities) —
 * extraído de chamados/[category]/novo/page.tsx para permitir que essa rota
 * passe a decidir, no servidor, entre este formulário genérico e o
 * NdaRequestForm (fluxo próprio, ver NdaRequestForm.tsx).
 */
export function ChamadoRequestForm({ categorySlug }: { categorySlug: TicketCategorySlug }) {
  const router = useRouter();
  const [requesterName, setRequesterName] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: categorySlug, requesterName, requesterEmail, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao abrir chamado.");
      router.push(`/chamados/${categorySlug}/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
      setLoading(false);
    }
  }

  const canSubmit = requesterName && requesterEmail && description;

  return (
    <div className="card section-gap" style={{ display: "grid", gap: 16 }}>
      <div className="field">
        <label className="label" htmlFor="chamado-requester-name">Seu nome</label>
        <input id="chamado-requester-name" className="input" value={requesterName} onChange={(e) => setRequesterName(e.target.value)} />
      </div>
      <div className="field">
        <label className="label" htmlFor="chamado-requester-email">Seu e-mail</label>
        <input id="chamado-requester-email" className="input" type="email" value={requesterEmail} onChange={(e) => setRequesterEmail(e.target.value)} placeholder="voce@acerto.com.br" />
      </div>
      <div className="field">
        <label className="label" htmlFor="chamado-description">O que você precisa?</label>
        <textarea
          id="chamado-description"
          className="input"
          style={{ minHeight: 120, resize: "vertical" }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descreva sua solicitação com o máximo de detalhes possível."
        />
      </div>

      {error && <p style={{ fontSize: 12.5, color: "var(--danger)", margin: 0 }}>{error}</p>}

      <div>
        <button className="btn btn-primary" disabled={loading || !canSubmit} onClick={submit}>
          {loading ? "Enviando…" : "Abrir chamado"}
        </button>
      </div>
    </div>
  );
}
