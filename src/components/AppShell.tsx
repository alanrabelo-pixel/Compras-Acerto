import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CommandPalette } from "@/components/CommandPalette";
import { UserAvatar } from "@/components/UserAvatar";
import { AnnouncementsPanel } from "@/components/AnnouncementsPanel";
import { loadCurrentUser } from "@/lib/current-user";
import { countRecentAnnouncements } from "@/lib/announcements";
import { canViewBoard } from "@/lib/roles";
import { LayoutGrid, ListChecks, FileText, LayoutDashboard, Settings, Building2, type LucideIcon } from "lucide-react";

const LOCAL_BYPASS_USER = { name: "Modo local (sem SSO)", email: "local@acerto.com.br", roles: ["ADMIN"] };

// Quadro geral, Minhas Pendências, Contratos e Dashboards são telas de
// gestão, só fazem sentido para quem tem acesso ao quadro (ver
// src/lib/roles.ts). Quem só tem o papel Solicitante nunca vê essas telas
// (o middleware já bloqueia o acesso direto por URL); pra essa pessoa a nav
// mostra só "Minhas Solicitações", o próprio recorte dela.
type NavItem = { href: string; label: string; icon: LucideIcon; sub?: boolean };

const BOARD_NAV_ITEMS: NavItem[] = [
  { href: "/solicitacoes", label: "Quadro", icon: LayoutGrid },
  { href: "/solicitacoes/pendencias", label: "Minhas Pendências", icon: ListChecks, sub: true },
  { href: "/contratos", label: "Contratos", icon: FileText },
  { href: "/dashboards", label: "Dashboards", icon: LayoutDashboard },
];
const SOLICITANTE_NAV_ITEMS: NavItem[] = [
  { href: "/solicitacoes/minhas", label: "Minhas Solicitações", icon: LayoutGrid },
];

/**
 * Casca de navegação da Acerto Compras: barra lateral (pedido do usuário,
 * seguindo o padrão mais comum em ferramentas internas com várias seções,
 * como Jira, Linear, Notion e ServiceNow, que escala melhor que uma barra
 * de topo à medida que o app ganha sub-seções, como Solicitações agora com
 * Quadro e Minhas Pendências). Substitui o antigo TopNav nas telas de
 * Compras; Chamados (Viagens/Facilities) e a página inicial continuam com
 * seu próprio cabeçalho simples (ChamadoHeader), por serem fluxos à parte.
 *
 * `active` identifica o item de nav atual (ver valores em BOARD_NAV_ITEMS /
 * SOLICITANTE_NAV_ITEMS). Cada
 * página passa o seu explicitamente, mesmo padrão que o TopNav já usava.
 */
export async function AppShell({ active, children }: { active?: string; children: React.ReactNode }) {
  const bypass = process.env.LOCAL_BYPASS_AUTH === "true";
  const session = bypass ? null : await getServerSession(authOptions);
  const user = bypass
    ? LOCAL_BYPASS_USER
    : (session?.user as { name?: string | null; email?: string | null; roles?: string[] } | undefined);
  const isAdmin = user?.roles?.includes("ADMIN");
  const showBoard = canViewBoard(user?.roles ?? []);
  const navItems = showBoard ? BOARD_NAV_ITEMS : SOLICITANTE_NAV_ITEMS;
  // Identidade real (id + avatar): null em bypass/sem sessão, ver
  // src/lib/current-user.ts. UserAvatar só permite upload quando não-nulo.
  const [currentUser, recentAnnouncementsCount] = await Promise.all([
    loadCurrentUser(),
    countRecentAnnouncements(),
  ]);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Pular para o conteúdo</a>
      <aside className="sidebar">
        <Link href="/" className="sidebar-brand" title="Voltar ao menu de apps da Acerto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/acerto-logo.svg" alt="Acerto" className="sidebar-logo" />
          <span className="sidebar-alai-divider" aria-hidden />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/alai-mark.svg" alt="alAi" className="sidebar-alai-icon" />
        </Link>

        <CommandPalette />

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link${item.sub ? " sub" : ""}${active === item.href ? " active" : ""}`}
              >
                <span className="sidebar-link-icon" aria-hidden><Icon size={16} strokeWidth={1.75} /></span>
                {item.label}
              </Link>
            );
          })}
          {isAdmin && (
            <>
              <p className="sidebar-section-label">Administração</p>
              <Link
                href="/admin/acessos"
                className={`sidebar-link${active === "/admin/acessos" ? " active" : ""}`}
              >
                <span className="sidebar-link-icon" aria-hidden><Settings size={16} strokeWidth={1.75} /></span>
                Acessos
              </Link>
              <Link
                href="/admin/centros-de-custo"
                className={`sidebar-link${active === "/admin/centros-de-custo" ? " active" : ""}`}
              >
                <span className="sidebar-link-icon" aria-hidden><Building2 size={16} strokeWidth={1.75} /></span>
                Centros de Custo
              </Link>
            </>
          )}
        </nav>

        <Link href="/solicitacoes/nova" className="btn btn-primary sidebar-cta">
          + Nova Solicitação
        </Link>

        {user && (
          <div className="sidebar-footer">
            <div className="sidebar-footer-identity">
              <UserAvatar userId={currentUser?.id ?? null} avatarUrl={currentUser?.avatarUrl ?? null} name={user.name ?? user.email ?? "?"} size={26} />
              <span className="sidebar-user">{user.name ?? user.email}</span>
            </div>
            <div className="sidebar-footer-actions">
              <AnnouncementsPanel isAdmin={Boolean(isAdmin)} authorName={currentUser?.name ?? user.name ?? ""} recentCount={recentAnnouncementsCount} align="left" dropUp />
              <ThemeToggle />
              <a href="/api/auth/signout" className="sidebar-signout">Sair</a>
            </div>
          </div>
        )}
      </aside>

      <div id="main-content" className="app-content">{children}</div>
    </div>
  );
}
