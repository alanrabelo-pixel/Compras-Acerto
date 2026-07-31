"use client";

import { useState } from "react";
import { AnnouncementsBody } from "@/components/AnnouncementsBody";
import { useAnnouncementsUnseen } from "@/components/useAnnouncementsUnseen";

/**
 * Botão de foguete — comunicados gerais para todo mundo (avisos simples,
 * sem alçada nem fluxo). Qualquer pessoa lê; só ADMIN publica (ver
 * POST /api/announcements). O conteúdo (lista + compor) vive em
 * AnnouncementsBody, reaproveitado também dentro do UserMenu da Home.
 * O badge mostra "não vistos neste navegador" (ver useAnnouncementsUnseen)
 * — abrir o painel marca tudo como visto e zera a contagem.
 */
export function AnnouncementsPanel({
  isAdmin, authorName, recentCount = 0, align = "right", dropUp = false,
}: { isAdmin: boolean; authorName: string; recentCount?: number; align?: "left" | "right"; dropUp?: boolean }) {
  const [open, setOpen] = useState(false);
  const { count: unseenCount, markSeen } = useAnnouncementsUnseen(recentCount);

  function toggle() {
    setOpen((v) => {
      const next = !v;
      if (next) markSeen();
      return next;
    });
  }

  return (
    <div className="announcements-wrap">
      <button
        type="button"
        className="exec-topbar-icon-link"
        onClick={toggle}
        title="Comunicados"
        aria-label={unseenCount > 0 ? `Comunicados (${unseenCount} novo(s))` : "Comunicados"}
      >
        <span aria-hidden>🚀</span>
        {unseenCount > 0 && <span className="exec-topbar-badge" aria-hidden>{unseenCount > 9 ? "9+" : unseenCount}</span>}
      </button>

      {open && (
        <>
          <div className="announcements-backdrop" onClick={() => setOpen(false)} role="presentation" />
          <div
            className={`announcements-panel${align === "left" ? " align-left" : ""}${dropUp ? " drop-up" : ""}`}
            role="dialog"
            aria-label="Comunicados gerais"
          >
            <AnnouncementsBody isAdmin={isAdmin} authorName={authorName} />
          </div>
        </>
      )}
    </div>
  );
}
