"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateOnly } from "@/lib/format";

type Attachment = { id: string; fileName: string; uploadedBy: string; createdAt: string };

/**
 * Anexos de um chamado (Viagens/Facilities/NDA), com o mesmo mecanismo de
 * armazenamento do AttachmentsPanel (solicitações), mas sem UserPicker: quem
 * abre/responde um chamado não precisa ser um usuário cadastrado no sistema
 * (mesmo padrão de "Seu nome" livre já usado em ChamadoThread).
 */
export function TicketAttachmentsPanel({
  ticketId, attachments, defaultUploadedBy = "",
}: { ticketId: string; attachments: Attachment[]; defaultUploadedBy?: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadedBy, setUploadedBy] = useState(defaultUploadedBy);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file || !uploadedBy) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("uploadedBy", uploadedBy);
      const res = await fetch(`/api/tickets/${ticketId}/attachments`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao enviar anexo.");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card section-gap">
      <h2 className="card-title accent">Anexos</h2>
      {attachments.length === 0 && <p style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Nenhum anexo ainda.</p>}
      {attachments.map((a) => (
        <div key={a.id} className="timeline-item" style={{ justifyContent: "space-between" }}>
          <a href={`/api/attachments/${a.id}/file`} style={{ color: "var(--acerto-green-dark)", textDecoration: "none", fontWeight: 600 }}>{a.fileName}</a>
          <span className="text-muted">{a.uploadedBy} · {formatDateOnly(a.createdAt)}</span>
        </div>
      ))}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, marginTop: 14, alignItems: "end" }}>
        <div className="field">
          <label className="label">Enviado por</label>
          <input className="input" value={uploadedBy} onChange={(e) => setUploadedBy(e.target.value)} placeholder="Seu nome" />
        </div>
        <input ref={fileRef} type="file" className="input" style={{ padding: 6 }} />
        <button className="btn btn-primary" disabled={loading || !uploadedBy} onClick={upload}>Enviar</button>
      </div>
      {error && <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 8 }}>{error}</p>}
    </section>
  );
}
