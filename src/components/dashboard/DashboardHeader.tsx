"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Cabeçalho executivo: atualizar, exportar (Excel/PDF), compartilhar
 * (copia o link com os filtros atuais), auto-refresh e tela cheia.
 * generatedAt vem do servidor (hora da última renderização/consulta).
 */
export function DashboardHeader({
  generatedAtIso, excelHref, pdfHref,
}: { generatedAtIso: string; excelHref: string; pdfHref: string }) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const generatedAt = new Date(generatedAtIso);

  function refresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 600);
  }

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(id);
  }, [autoRefresh, router]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function share() {
    await navigator.clipboard.writeText(window.location.href);
    setShareState("copied");
    setTimeout(() => setShareState("idle"), 2000);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  }

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
      <div>
        <h1 className="page-title" style={{ margin: 0 }}>Dashboard Executivo · Compras</h1>
        <p className="page-subtitle" style={{ margin: "4px 0 0" }}>
          Acerto · Atualizado em {generatedAt.toLocaleString("pt-BR")}
        </p>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--ink-soft)" }}>
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          Auto-refresh (60s)
        </label>
        <button className="btn btn-secondary" onClick={refresh} disabled={refreshing}>
          {refreshing ? "Atualizando..." : "↻ Atualizar"}
        </button>
        <button className="btn btn-secondary" onClick={share}>
          {shareState === "copied" ? "✓ Link copiado" : "🔗 Compartilhar"}
        </button>
        <a className="btn btn-secondary" href={excelHref} style={{ textDecoration: "none" }}>⬇ Excel</a>
        <a className="btn btn-secondary" href={pdfHref} style={{ textDecoration: "none" }} target="_blank" rel="noreferrer">⬇ PDF</a>
        <button className="btn btn-secondary" onClick={toggleFullscreen}>
          {isFullscreen ? "⤢ Sair tela cheia" : "⤢ Tela cheia"}
        </button>
      </div>
    </div>
  );
}
