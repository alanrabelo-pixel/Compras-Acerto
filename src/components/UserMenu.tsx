"use client";

import { useState } from "react";
import { UserAvatar } from "@/components/UserAvatar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AnnouncementsBody } from "@/components/AnnouncementsBody";
import { useAnnouncementsUnseen } from "@/components/useAnnouncementsUnseen";
import { Bell, Rocket, SunMoon, Settings, Users, Building2, LogOut, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

type View = "menu" | "comunicados" | "acessos";

/**
 * Menu único do usuário no topbar da Home. Reúne Minhas Pendências,
 * Comunicados, Tema, Configuração (Administração, com os subitens Usuários
 * e Centro de custos) e Sair num só lugar, disparado a partir do avatar/nome
 * ("Modo local (sem SSO)" em bypass), em vez de espalhar cada um como um
 * ícone separado no topbar.
 */
export function UserMenu({
  userId, avatarUrl, name, isAdmin, pendingCount, recentAnnouncementsCount, authorName,
}: {
  userId: string | null;
  avatarUrl: string | null;
  name: string;
  isAdmin: boolean;
  pendingCount: number;
  recentAnnouncementsCount: number;
  authorName: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");
  const { count: unseenCount, markSeen } = useAnnouncementsUnseen(recentAnnouncementsCount);

  function close() {
    setOpen(false);
    setView("menu");
  }

  return (
    <div className="user-menu-wrap">
      {/* Não é um <button> porque envolve o <button> do próprio UserAvatar
          (upload de foto). Botão dentro de botão é HTML inválido e trava o
          clique. Div com role="button" mantém a semântica/teclado sem
          aninhar elementos interativos. */}
      <div
        className="user-menu-trigger"
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span onClick={(e) => userId && e.stopPropagation()}>
          <UserAvatar userId={userId} avatarUrl={avatarUrl} name={name} size={28} />
        </span>
        <span className="user-menu-trigger-name">{name}</span>
        {(pendingCount > 0 || unseenCount > 0) && (
          <span className="user-menu-trigger-dot" aria-hidden />
        )}
        <span className="user-menu-trigger-caret" aria-hidden><ChevronDown size={14} strokeWidth={2} /></span>
      </div>

      {open && (
        <>
          <div className="announcements-backdrop" onClick={close} role="presentation" />
          <div className="user-menu-panel" role="menu" aria-label="Menu do usuário">
            {view === "menu" ? (
              <div className="user-menu-list">
                <a href="/solicitacoes/pendencias" className="user-menu-item" role="menuitem">
                  <span aria-hidden><Bell size={16} strokeWidth={1.75} /></span>
                  <span>Minhas Pendências</span>
                  {pendingCount > 0 && <span className="user-menu-badge">{pendingCount > 9 ? "9+" : pendingCount}</span>}
                </a>

                <button
                  type="button"
                  className="user-menu-item"
                  role="menuitem"
                  onClick={() => { setView("comunicados"); markSeen(); }}
                >
                  <span aria-hidden><Rocket size={16} strokeWidth={1.75} /></span>
                  <span>Comunicados</span>
                  {unseenCount > 0 && (
                    <span className="user-menu-badge">
                      {unseenCount > 9 ? "9+" : unseenCount}
                    </span>
                  )}
                  <span className="user-menu-item-arrow" aria-hidden><ChevronRight size={14} strokeWidth={1.75} /></span>
                </button>

                <div className="user-menu-item user-menu-theme-row">
                  <span><span aria-hidden><SunMoon size={16} strokeWidth={1.75} /></span> Tema</span>
                  <ThemeToggle />
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    className="user-menu-item"
                    role="menuitem"
                    onClick={() => setView("acessos")}
                  >
                    <span aria-hidden><Settings size={16} strokeWidth={1.75} /></span>
                    <span>Configuração (Administração)</span>
                    <span className="user-menu-item-arrow" aria-hidden><ChevronRight size={14} strokeWidth={1.75} /></span>
                  </button>
                )}

                <div className="user-menu-divider" />

                <a href="/api/auth/signout" className="user-menu-item user-menu-item-danger" role="menuitem">
                  <span aria-hidden><LogOut size={16} strokeWidth={1.75} /></span>
                  <span>Sair</span>
                </a>
              </div>
            ) : view === "acessos" ? (
              <div className="user-menu-sub">
                <button type="button" className="user-menu-back" onClick={() => setView("menu")}>
                  <span aria-hidden><ChevronLeft size={14} strokeWidth={1.75} /></span> Voltar
                </button>
                <div className="user-menu-list">
                  <a href="/admin/acessos" className="user-menu-item" role="menuitem">
                    <span aria-hidden><Users size={16} strokeWidth={1.75} /></span>
                    <span>Usuários</span>
                  </a>
                  <a href="/admin/centros-de-custo" className="user-menu-item" role="menuitem">
                    <span aria-hidden><Building2 size={16} strokeWidth={1.75} /></span>
                    <span>Centro de custos</span>
                  </a>
                </div>
              </div>
            ) : (
              <div className="user-menu-sub">
                <button type="button" className="user-menu-back" onClick={() => setView("menu")}>
                  <span aria-hidden><ChevronLeft size={14} strokeWidth={1.75} /></span> Voltar
                </button>
                <AnnouncementsBody isAdmin={isAdmin} authorName={authorName} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
