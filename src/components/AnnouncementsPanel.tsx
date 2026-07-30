"use client";

import { useState } from "react";
import { AnnouncementsBody } from "@/components/AnnouncementsBody";

/**
 * Botão de foguete — comunicados gerais para todo mundo (avisos simples,
 * sem alçada nem fluxo). Qualquer pessoa lê; só ADMIN publica (ver
 * POST /api/announcements). O conteúdo (lista + compor) vive em
 * AnnouncementsBody, reaproveitado também dentro do UserMenu da Home.
 */
export function AnnouncementsPanel({
  isAdmin, authorName, recentCount = 0, align = "right", dropUp = false,
}: { isAdmin: boolean; authorName: string; recentCount?: number; align?: "left" | "right"; dropUp?: boolean }) {
  const [open, setOpen] = useState(false);

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
            <AnnouncementsBody isAdmin={isAdmin} authorName={authorName} />
          </div>
        </>
      )}
    </div>
  );
}
