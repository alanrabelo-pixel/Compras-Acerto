"use client";

import { useEffect, useRef, useState } from "react";

type ChatRole = "COMPRADOR" | "SOLICITANTE";
type ChatMessage = {
  id: string;
  authorRole: ChatRole;
  authorName: string;
  body: string;
  source: "APP" | "SLACK";
  createdAt: string;
};

const ROLE_LABEL: Record<ChatRole, string> = { COMPRADOR: "Comprador", SOLICITANTE: "Solicitante" };

export function RequestChatWidget({
  requestId,
  requesterName,
  buyerName,
}: {
  requestId: string;
  requesterName: string;
  buyerName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<ChatRole | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  async function fetchMessages() {
    const res = await fetch(`/api/requests/${requestId}/chat`);
    if (!res.ok) return;
    const data = await res.json();
    setMessages(data.messages);
    if (!open && data.messages.length > lastCountRef.current) {
      setUnread((u) => u + (data.messages.length - lastCountRef.current));
    }
    lastCountRef.current = data.messages.length;
  }

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }
  }, [open, messages]);

  async function send() {
    if (!role || !text.trim()) return;
    setSending(true);
    try {
      const authorName = role === "SOLICITANTE" ? requesterName : buyerName || "Comprador";
      const res = await fetch(`/api/requests/${requestId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorRole: role, authorName, body: text.trim() }),
      });
      if (res.ok) {
        setText("");
        await fetchMessages();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-widget">
      {open && (
        <div className="chat-panel">
          <div className="chat-panel-header">
            <span>Conversa com {role === "SOLICITANTE" ? "o comprador" : "o solicitante"}</span>
            <button className="chat-panel-close" onClick={() => setOpen(false)} aria-label="Fechar">
              ×
            </button>
          </div>

          {!role ? (
            <div className="chat-role-picker">
              <p>Você é:</p>
              <button className="btn btn-secondary" onClick={() => setRole("SOLICITANTE")}>
                Solicitante — {requesterName}
              </button>
              <button className="btn btn-secondary" onClick={() => setRole("COMPRADOR")} disabled={!buyerName}>
                Comprador{buyerName ? ` — ${buyerName}` : " (ainda não atribuído)"}
              </button>
            </div>
          ) : (
            <>
              <div className="chat-panel-body" ref={listRef}>
                {messages.length === 0 && <p className="chat-empty">Nenhuma mensagem ainda. Diga oi 👋</p>}
                {messages.map((m) => (
                  <div key={m.id} className={`chat-bubble-row ${m.authorRole === role ? "self" : ""}`}>
                    <div className="chat-bubble">
                      <div className="chat-bubble-meta">
                        {m.authorName} · {ROLE_LABEL[m.authorRole]}
                        {m.source === "SLACK" && " · via Slack"}
                      </div>
                      <div className="chat-bubble-text">{m.body}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="chat-panel-input">
                <textarea
                  className="input"
                  placeholder="Escreva sua mensagem…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  style={{ minHeight: 40, resize: "none" }}
                />
                <button className="btn btn-primary" onClick={send} disabled={sending || !text.trim()}>
                  Enviar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <button className="chat-bubble-toggle" onClick={() => setOpen((o) => !o)} aria-label="Abrir conversa">
        {unread > 0 && <span className="chat-unread-badge">{unread}</span>}
        {open ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
          </svg>
        )}
      </button>
    </div>
  );
}
