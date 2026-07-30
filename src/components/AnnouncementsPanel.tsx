"use client";

import { useEffect, useState } from "react";

type Announcement = { id: string; title: string; body: string; authorName: string; createdAt: string };

/**
 * Botão de foguete — comunicados gerais para todo mundo (avisos simples,
 * sem alçada nem fluxo). Qualquer pessoa lê; só ADMIN publica (ver
 * POST /api/announcements). `authorName` vem pré-preenchido com quem está
 * logado (quando há sessão real) para não pedir pra digitar o próprio nome
 * toda vez, mas continua editável.
 */
export function AnnouncementsPanel({
  isAdmin, authorName: initialAuthorName, recentCount = 0, align = "right", dropUp = false,
}: { isAdmin: boolean; authorName: string; recentCount?: number; align?: "left" | "right"; dropUp?: boolean }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [authorName, setAuthorName] = useState(initialAuthorName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && items === null) {
      fetch("/api/announcements")
        .then((res) => res.json())
        .then(setItems)
        .catch(() => setItems([]));
    }
  }, [open, items]);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, authorName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível publicar o comunicado.");
      setItems((prev) => [data, ...(prev ?? [])]);
      setTitle("");
      setBody("");
      setComposing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = title.trim() && body.trim() && authorName.trim();

  return (
    <div className="announcements-wrap">
      <button
        type="button"
        className="exec-topbar-icon-link"
        onClick={() => setOpen((v) => !v)}
        title="Comunicados"
        aria-label={recentCount > 0 ? `Comunicados (${recentCount} novo(s))` : "Comunicados"}
      >
        <span aria-hidden>🚀</span>
        {recentCount > 0 && <span className="exec-topbar-badge" aria-hidden>{recentCount > 9 ? "9+" : recentCount}</span>}
      </button>

      {open && (
        <>
          <div className="announcements-backdrop" onClick={() => setOpen(false)} role="presentation" />
          <div
            className={`announcements-panel${align === "left" ? " align-left" : ""}${dropUp ? " drop-up" : ""}`}
            role="dialog"
            aria-label="Comunicados gerais"
          >
            <div className="announcements-panel-header">
              <span>Comunicados</span>
              {isAdmin && (
                <button type="button" className="announcements-compose-toggle" onClick={() => setComposing((v) => !v)}>
                  {composing ? "Cancelar" : "+ Novo"}
                </button>
              )}
            </div>

            {composing && (
              <div className="announcements-compose">
                <input
                  className="input" placeholder="Seu nome" value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                />
                <input
                  className="input" placeholder="Título" value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <textarea
                  className="input" placeholder="Mensagem para todo mundo" value={body}
                  onChange={(e) => setBody(e.target.value)} style={{ minHeight: 70, resize: "vertical" }}
                />
                {error && <p className="announcements-error" role="alert">{error}</p>}
                <button type="button" className="btn btn-primary" disabled={loading || !canSubmit} onClick={submit}>
                  {loading ? "Publicando…" : "Publicar para todos"}
                </button>
              </div>
            )}

            <div className="announcements-list">
              {items === null && <p className="announcements-empty">Carregando…</p>}
              {items?.length === 0 && <p className="announcements-empty">Nenhum comunicado ainda.</p>}
              {items?.map((a) => (
                <div key={a.id} className="announcements-item">
                  <p className="announcements-item-title">{a.title}</p>
                  <p className="announcements-item-body">{a.body}</p>
                  <p className="announcements-item-meta">
                    {a.authorName} · {new Date(a.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
