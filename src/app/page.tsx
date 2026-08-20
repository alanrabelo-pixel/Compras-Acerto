import { getServerSession } from "next-auth";
import { ShoppingCart, Plane, Wrench, Scale, ArrowRight } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { loadHomeData } from "@/lib/home-data";
import { formatDateTime } from "@/lib/format";
import { Badge, TableWrap, TableHeadRow, TableRow } from "@/components/ui";
import { CommandPalette } from "@/components/CommandPalette";
import { UserMenu } from "@/components/UserMenu";
import { loadCurrentUser } from "@/lib/current-user";
import { countRecentAnnouncements } from "@/lib/announcements";
import { bypassAuthAtivo } from "@/lib/bypass";

// Compras é o único serviço com fluxo completo (triagem, cotação, aprovação,
// contrato). Os outros 3 são canais de chamado mais simples. Tratá-los como
// 4 peers num grid uniforme escondia essa diferença real; agora Compras é o
// card em destaque e os outros formam uma faixa secundária mais discreta
// (ver "Outros canais" abaixo).
const FEATURED_SERVICE = {
  href: "/solicitacoes",
  eyebrow: "Compras",
  title: "Solicitação de Compras",
  description: "Abra uma solicitação e acompanhe todo o processo (triagem, cotação, aprovação e contrato) em um só lugar.",
  icon: <ShoppingCart size={22} strokeWidth={1.75} />,
};

const SECONDARY_SERVICES = [
  {
    href: "/chamados/viagens",
    title: "Viagens Acerto",
    description: "Dúvidas de viagem, Uber Corporativo e reembolsos.",
    icon: <Plane size={16} strokeWidth={1.75} />,
  },
  {
    href: "/chamados/facilities",
    title: "Gestão de Facilities",
    description:
      "Solicitação de manutenção, materiais, registro de incidentes estruturais e eventos internos.",
    icon: <Wrench size={16} strokeWidth={1.75} />,
  },
  {
    href: "/chamados/nda",
    title: "Cadastros, Contratos de Fornecedores e NDA",
    description:
      "Solicitação de cadastro de fornecedores, NDA, consultas de contratos ativos e fornecedores homologados.",
    icon: <Scale size={16} strokeWidth={1.75} />,
  },
];

const LOCAL_BYPASS_USER = { name: "Modo local (sem SSO)", email: "local@acerto.com.br", roles: ["ADMIN"] };

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const bypass = bypassAuthAtivo();
  const session = bypass ? null : await getServerSession(authOptions);
  const user = bypass
    ? LOCAL_BYPASS_USER
    : (session?.user as { name?: string | null; email?: string | null; roles?: string[] } | undefined);
  const isAdmin = user?.roles?.includes("ADMIN");

  const [homeData, currentUser, recentAnnouncementsCount] = await Promise.all([
    loadHomeData(session?.user?.email ?? null),
    loadCurrentUser(),
    countRecentAnnouncements(),
  ]);
  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  const pendingCount = homeData.personalized ? homeData.pendingCount : 0;
  // Saudação só quando há uma pessoa real logada (SSO). No bypass de dev
  // (sem sessão real), "Modo local (sem SSO)" não é um nome de pessoa, então
  // cai para um título operacional neutro em vez de uma saudação quebrada.
  const firstName = !bypass && session?.user?.name ? session.user.name.trim().split(/\s+/)[0] : null;

  return (
    <>
    <main className="exec-home">
      <header className="exec-topbar">
        <div className="exec-topbar-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/acerto-logo.svg" alt="Acerto" className="exec-topbar-logo" />
          <span className="exec-topbar-divider" aria-hidden />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/alai-logo.svg" alt="alAi" className="exec-topbar-alai-full" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/alai-mark.svg" alt="alAi" className="exec-topbar-alai-icon" />
        </div>

        <div className="exec-topbar-search">
          <CommandPalette />
        </div>

        <div className="exec-topbar-actions">
          {user && (
            <UserMenu
              userId={currentUser?.id ?? null}
              avatarUrl={currentUser?.avatarUrl ?? null}
              name={user.name ?? user.email ?? "?"}
              isAdmin={Boolean(isAdmin)}
              pendingCount={pendingCount}
              recentAnnouncementsCount={recentAnnouncementsCount}
              authorName={currentUser?.name ?? user.name ?? ""}
            />
          )}
        </div>
      </header>

      <div className="exec-welcome-banner">
        <div className="exec-welcome-banner-heading">
          <p className="exec-welcome-banner-eyebrow">Visão geral</p>
          <p className="exec-welcome-banner-title">Painel de Compras</p>
          {firstName && <p className="exec-welcome-banner-greeting">Olá, {firstName}!</p>}
          <p className="exec-welcome-banner-subtitle">
            Acompanhe suas solicitações, contratos e chamados para o time de Compras em um único lugar.
          </p>
        </div>
        <p className="exec-welcome-banner-date">{today}</p>
      </div>

      {/* O que precisa de ação agora vem ANTES dos números de referência.
          Por isso "Minha Atenção" (era "Meu Painel") passou a liderar a
          tela, e os indicadores abaixo viraram uma faixa quieta de apoio. */}
      {homeData.personalized && (
        <section className="exec-section">
          <div className="exec-section-header">
            <p className="exec-section-title">Minha Atenção</p>
            <span className="exec-section-meta">{homeData.requesterName}</span>
          </div>
          {homeData.items.length > 0 ? (
            <TableWrap>
              <TableHeadRow columns="0.7fr 2.2fr 0.9fr 0.9fr">
                <span>Código</span>
                <span>Descrição</span>
                <span>Status</span>
                <span>Atualizado</span>
              </TableHeadRow>
              {homeData.items.map((item) => (
                <TableRow key={item.id} href={item.href} columns="0.7fr 2.2fr 0.9fr 0.9fr" style={{ alignItems: "center" }}>
                  <span className="exec-worklist-row-code">{item.code}</span>
                  <span className="exec-worklist-row-title">{item.title}</span>
                  <Badge variant="neutral">{item.statusLabel}</Badge>
                  <span className="exec-worklist-row-date">{formatDateTime(item.updatedAt)}</span>
                </TableRow>
              ))}
            </TableWrap>
          ) : (
            <p className="exec-worklist-empty">
              Nenhuma solicitação ou chamado no momento. Escolha um serviço abaixo para começar.
            </p>
          )}
        </section>
      )}

      <div className="exec-stat-strip" role="group" aria-label="Resumo geral">
        <a className="exec-stat exec-stat-link" href="/solicitacoes?view=lista">
          <span className="exec-stat-value">{homeData.stats.openRequests}</span>
          <span className="exec-stat-label">Solicitações de Compra em aberto</span>
        </a>
        {/* Sem link direto: "abertos" soma as 3 categorias de chamados, e não existe
            uma lista unificada pra abrir (só um board por categoria em
            /chamados/[category]). Em vez de linkar pra uma categoria só (errado, já
            que o número é o agregado), passar o mouse revela a distribuição real por
            canal, cada um levando ao board certo. */}
        <div className="exec-stat exec-stat-hoverable" tabIndex={0}>
          <span className="exec-stat-value">{homeData.stats.openTickets}</span>
          <span className="exec-stat-label">Chamados abertos</span>
          <div className="exec-stat-breakdown" role="menu">
            {homeData.stats.ticketsByCategory.map((c) => (
              <a key={c.slug} href={`/chamados/${c.slug}`} className="exec-stat-breakdown-item" role="menuitem">
                <span>{c.label}</span>
                <span className="exec-stat-breakdown-count">{c.count}</span>
              </a>
            ))}
          </div>
        </div>
        <a className="exec-stat exec-stat-link" href="/contratos">
          <span className="exec-stat-value">{homeData.stats.expiringContracts}</span>
          <span className="exec-stat-label">Contratos vencendo em 30 dias</span>
        </a>
      </div>

      <section className="exec-section">
        <div className="exec-section-header">
          <div>
            <p className="exec-section-title">Serviços</p>
            <p className="exec-section-subtitle">Escolha um serviço para abrir uma nova solicitação ou acompanhar o que já está em andamento.</p>
          </div>
        </div>

        <a href={FEATURED_SERVICE.href} className="exec-service-featured">
          <span className="exec-service-featured-icon" aria-hidden>{FEATURED_SERVICE.icon}</span>
          <span className="exec-service-featured-body">
            <span className="exec-service-featured-eyebrow">{FEATURED_SERVICE.eyebrow}</span>
            <span className="exec-service-featured-title">{FEATURED_SERVICE.title}</span>
            <span className="exec-service-featured-desc">{FEATURED_SERVICE.description}</span>
          </span>
          <span className="exec-service-featured-cta">Acessar <ArrowRight size={15} strokeWidth={2} /></span>
        </a>

        <p className="exec-service-secondary-heading">Outros canais de atendimento</p>
        <div className="exec-service-secondary-row">
          {SECONDARY_SERVICES.map((s) => (
            <a key={s.href} href={s.href} className="exec-service-secondary-card">
              {s.href === homeData.popularHref && (
                <span className="exec-service-secondary-badge" title="Mais solicitado nos últimos 30 dias">Mais usado</span>
              )}
              <span className="exec-service-secondary-icon" aria-hidden>{s.icon}</span>
              <span className="exec-service-secondary-title">{s.title}</span>
              <p className="exec-service-secondary-desc">{s.description}</p>
            </a>
          ))}
        </div>
      </section>

    </main>

    <footer className="exec-brand-footer">
      <div className="exec-brand-footer-inner">
        <div className="exec-brand-footer-links">
          <p className="exec-brand-footer-links-title">Links úteis:</p>
          <div className="exec-footer">
            <a href="/api/manual/pdf" target="_blank" rel="noopener noreferrer" className="exec-footer-link">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/documento-generico.png" alt="" />
              Baixar manual do processo alAi (PDF)
            </a>
            <a
              href="https://acerto.atlassian.net/wiki/spaces/~712020937f655593794b57918a9de7aea12eac/pages/1562738748/POL+TICA+DE+COMPRAS+V.04.25"
              target="_blank"
              rel="noopener noreferrer"
              className="exec-footer-link"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/livro-aberto.png" alt="" />
              Política de Compras
            </a>
            <a href="https://drive.google.com/file/d/1EkfPd3uldUSi3vt9GYyFAF75PvklAdbk/view" target="_blank" rel="noopener noreferrer" className="exec-footer-link">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/documento-generico.png" alt="" />
              Política de Viagem
            </a>
            <a href="https://drive.google.com/file/d/1MCQiA9w9GJa711nvImbEDWcb8LfGEgxD/view" target="_blank" rel="noopener noreferrer" className="exec-footer-link">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/documento-generico.png" alt="" />
              Política de Reembolso
            </a>
            <a href="https://drive.google.com/file/d/1oQH4yxyUR10iX1-ae6dk1vcEy6QeCXo_/view" target="_blank" rel="noopener noreferrer" className="exec-footer-link">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/documento-generico.png" alt="" />
              Política de Uso do Uber Corporativo
            </a>
          </div>
        </div>

        <div className="exec-brand-footer-company">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/acerto-logo.svg" alt="Acerto" className="exec-brand-footer-logo" />
          <p>
            Time de Compras 💚 · acerto.com.br · Rua Bernardo Mascarenhas, 46 - Cidade Jardim, Belo Horizonte/MG. CEP:
            30.380-010.
          </p>
        </div>
      </div>
    </footer>
    </>
  );
}
