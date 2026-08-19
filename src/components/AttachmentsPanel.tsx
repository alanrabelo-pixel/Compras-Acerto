"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPicker } from "@/components/UserPicker";

type Attachment = { id: string; fileName: string; uploadedBy: string; stage: string | null; createdAt: string };

export function AttachmentsPanel({
  requestId, attachments, uploaderId, category, title = "Anexos", emptyLabel = "Nenhum anexo ainda. Use o campo abaixo para enviar um arquivo.",
}: {
  requestId: string;
  attachments: Attachment[];
  uploaderId: string;
  category?: string;
  title?: string;
  emptyLabel?: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadedBy, setUploadedBy] = useState(uploaderId ?? "");
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
      if (category) form.append("category", category);
      const res = await fetch(`/api/requests/${requestId}/attachments`, { method: "POST", body: form });
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
      <h2 className="card-title accent">{title}</h2>
      {attachments.length === 0 && <p style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>{emptyLabel}</p>}
      {attachments.map((a) => (
        <div key={a.id} className="timeline-item" style={{ justifyContent: "space-between" }}>
          <a href={`/api/attachments/${a.id}/file`} style={{ color: "var(--acerto-green-dark)", textDecoration: "none", fontWeight: 600 }}>{a.fileName}</a>
          <span className="text-muted">{a.stage} · {new Date(a.createdAt).toLocaleDateString("pt-BR")}</span>
        </div>
      ))}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, marginTop: 14, alignItems: "end" }}>
        <div>
          <label className="label">Enviado por</label>
          <UserPicker value={uploadedBy} onChange={setUploadedBy} placeholder="Selecione quem envia" />
        </div>
        <input ref={fileRef} type="file" className="input" style={{ padding: 6 }} />
        <button className="btn btn-primary" disabled={loading || !uploadedBy} onClick={upload}>Enviar</button>
      </div>
      {error && <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 8 }}>{error}</p>}
    </section>
  );
}
