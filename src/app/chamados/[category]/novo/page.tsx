"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { TICKET_CATEGORIES, isTicketCategorySlug } from "@/lib/tickets";
import { ChamadoHeader } from "@/components/ChamadoHeader";

export default function NovoChamadoPage() {
  const router = useRouter();
  const params = useParams<{ category: string }>();
  const categorySlug = params.category;

  if (!isTicketCategorySlug(categorySlug)) {
    return (
      <main className="page-narrow" style={{ paddingTop: 60, textAlign: "center" }}>
        <p>Categoria de chamado inválida.</p>
        <a href="/" className="back-link">← voltar ao menu</a>
      </main>
    );
  }
  const config = TICKET_CATEGORIES[categorySlug];

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
    <>
      <ChamadoHeader categoryLabel={config.label} backHref={`/chamados/${categorySlug}`} backLabel="← voltar aos chamados" />
      <main className="page-narrow" style={{ paddingTop: 28 }}>
        <h1 className="page-title">Novo chamado — {config.label}</h1>
        <p className="page-subtitle">Preencha seus dados e descreva o que você precisa.</p>

        {categorySlug === "viagens" && (
          <div
            className="section-gap"
            style={{ background: "var(--warning-bg)", border: "1px solid #fbdba0", borderRadius: 10, padding: 12, fontSize: 12.5, color: "var(--warning)", lineHeight: 1.5 }}
          >
            ⚠ Este canal é só para resolver problemas com viagens (dúvidas, imprevistos, alterações). Para solicitar
            passagens aéreas, rodoviárias ou hospedagem, use o <strong>Onfly</strong> em{" "}
            <a href="https://app.onfly.com" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", fontWeight: 700 }}>
              app.onfly.com
            </a>
            .
          </div>
        )}

        <div className="card section-gap" style={{ display: "grid", gap: 16 }}>
          <div className="field">
            <label className="label">Seu nome</label>
            <input className="input" value={requesterName} onChange={(e) => setRequesterName(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Seu e-mail</label>
            <input className="input" type="email" value={requesterEmail} onChange={(e) => setRequesterEmail(e.target.value)} placeholder="voce@acerto.com.br" />
          </div>
          <div className="field">
            <label className="label">O que você precisa?</label>
            <textarea
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
      </main>
    </>
  );
}
