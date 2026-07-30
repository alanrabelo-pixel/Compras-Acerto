"use client";

import { useEffect, useState } from "react";

type Announcement = { id: string; title: string; body: string; authorName: string; createdAt: string };

/**
 * Conteúdo de Comunicados (lista + compor) sem o botão-gatilho nem o
 * backdrop — extraído de AnnouncementsPanel para poder ser encaixado tanto
 * no seu próprio dropdown (rodapé do AppShell) quanto aninhado dentro do
 * UserMenu (topbar da Home), sem duplicar a lógica de fetch/publicação.
 */
export function AnnouncementsBody({
  isAdmin, authorName: initialAuthorName,
}: { isAdmin: boolean; authorName: string }) {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [authorName, setAuthorName] = useState(initialAuthorName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (items === null) {
      fetch("/api/announcements")
        .then((res) => res.json())
        .then(setItems)
        .catch(() => setItems([]));
    }
  }, [items]);

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
    <>
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
    </>
  );
}
