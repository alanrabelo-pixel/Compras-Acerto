"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ImportResult = {
  created: number;
  failed: number;
  results: { row: number; status: "criado" | "erro"; detail: string }[];
};

export function ContractImportUpload() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/contratos/import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao importar planilha.");
        return;
      }
      setResult(data);
      router.refresh();
    } catch {
      setError("Falha ao enviar o arquivo.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-secondary" onClick={() => setOpen(true)}>
        📥 Importar planilha
      </button>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h2 className="card-title">Importar contratos em massa</h2>
      <p style={{ fontSize: 12.5, color: "var(--ink-muted)", marginBottom: 12 }}>
        Use para alimentar contratos que já existem e não nasceram de uma solicitação neste sistema.
        Cada linha vira um contrato independente; linhas com erro são reportadas sem travar as demais.
      </p>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <a className="btn btn-secondary" href="/api/contratos/import" style={{ textDecoration: "none" }}>
          ⬇ Baixar planilha modelo
        </a>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="input" style={{ maxWidth: 280 }} />
        <button className="btn btn-primary" disabled={loading} onClick={onSubmit}>
          {loading ? "Importando..." : "Enviar"}
        </button>
        <button className="btn btn-secondary" onClick={() => { setOpen(false); setResult(null); setError(null); }}>
          Fechar
        </button>
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 10 }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 12.5, fontWeight: 700 }}>
            {result.created} contrato(s) criado(s), {result.failed} linha(s) com erro.
          </p>
          {result.failed > 0 && (
            <div style={{ display: "grid", gap: 4, marginTop: 8, maxHeight: 220, overflowY: "auto" }}>
              {result.results.filter((r) => r.status === "erro").map((r) => (
                <p key={r.row} style={{ fontSize: 11.5, color: "var(--danger)", margin: 0 }}>
                  Linha {r.row}: {r.detail}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
