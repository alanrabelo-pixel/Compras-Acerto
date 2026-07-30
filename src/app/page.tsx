import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadHomeData } from "@/lib/home-data";
import { Badge, TableWrap, TableHeadRow, TableRow } from "@/components/ui";
import { CommandPalette } from "@/components/CommandPalette";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ServiceCatalog, type ServiceOption } from "@/components/home/ServiceCatalog";

const OPTIONS: ServiceOption[] = [
  {
    href: "/solicitacoes",
    eyebrow: "Compras",
    title: "Solicitação de Compras",
    description: "Abra e acompanhe processos de compra, da solicitação ao pagamento.",
    illustration: "/illustrations/cartao-dinheiro.png",
  },
  {
    href: "/chamados/viagens",
    eyebrow: "Viagens",
    title: "Viagens Acerto",
    description: "Dúvidas ou imprevistos de viagem a trabalho (passagens: use o Onfly).",
    illustration: "/illustrations/homem-escada.png",
  },
  {
    href: "/chamados/facilities",
    eyebrow: "Facilities",
    title: "Facilities",
    description: "Manutenção, infraestrutura do escritório e materiais.",
    illustration: "/illustrations/dupla-parceria.png",
  },
  {
    href: "/chamados/nda",
    eyebrow: "Jurídico",
    title: "Envio de NDA (Termo de Confidencialidade)",
    description: "Solicite o envio de um termo de confidencialidade a um fornecedor.",
    illustration: "/illustrations/computador-digital.png",
  },
];

const LOCAL_BYPASS_USER = { name: "Modo local (sem SSO)", email: "local@acerto.com.br", roles: ["ADMIN"] };

export const dynamic = "force-dynamic";

function formatUpdatedAt(date: Date) {
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export default async function HomePage() {
  const bypass = process.env.LOCAL_BYPASS_AUTH === "true";
  const session = bypass ? null : await getServerSession(authOptions);
  const user = bypass
    ? LOCAL_BYPASS_USER
    : (session?.user as { name?: string | null; email?: string | null; roles?: string[] } | undefined);
  const isAdmin = user?.roles?.includes("ADMIN");

  const homeData = await loadHomeData(session?.user?.email ?? null);
  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  // Só usa o primeiro nome quando há personalização real (sessão SSO
  // resolvida a um User) — em bypass local, user.name é só o rótulo "Modo
  // local (sem SSO)", não o nome de ninguém, então a saudação fica genérica.
  const firstName = homeData.personalized ? homeData.requesterName.split(" ")[0] : null;
  const pendingCount = homeData.personalized ? homeData.pendingCount : 0;

  return (
    <main className="exec-home">
      <header className="exec-topbar">
        <div className="exec-topbar-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/acerto-logo.svg" alt="Acerto" className="exec-topbar-logo" />
          <span className="exec-topbar-divider" aria-hidden />
          <div>
            <p className="exec-topbar-subtitle">Portal de Serviços Corporativos</p>
            <h1 className="exec-topbar-title">Acerto Compras</h1>
          </div>
        </div>

        <div className="exec-topbar-search">
          <CommandPalette />
        </div>

        <div className="exec-topbar-actions">
          <a
            href="/solicitacoes/pendencias"
            className="exec-topbar-icon-link"
            title="Minhas Pendências"
            aria-label={pendingCount > 0 ? `Minhas Pendências (${pendingCount} aguardando ação)` : "Minhas Pendências"}
          >
            <span aria-hidden>🔔</span>
            {pendingCount > 0 && <span className="exec-topbar-badge" aria-hidden>{pendingCount > 9 ? "9+" : pendingCount}</span>}
          </a>
          <ThemeToggle />
          {isAdmin && (
            <a href="/admin/acessos" className="exec-topbar-icon-link" title="Acessos (Administração)" aria-label="Acessos (Administração)">
              <span aria-hidden>⚙️</span>
            </a>
          )}
          {user && (
            <div className="exec-user-chip">
              <span className="exec-user-chip-name">{user.name ?? user.email}</span>
              <a href="/api/auth/signout" className="exec-user-chip-signout">Sair</a>
            </div>
          )}
        </div>
      </header>

      <div className="exec-welcome-banner">
        <p>
          {greeting()}{firstName ? `, ${firstName}` : ""} — o que você precisa hoje?
        </p>
        <p className="exec-welcome-banner-date">{today}</p>
      </div>

      <div className="exec-kpi-row" role="group" aria-label="Resumo geral">
        <div className="exec-kpi">
          <span className="exec-kpi-value">{homeData.stats.openRequests}</span>
          <span className="exec-kpi-label">Solicitações em aberto</span>
        </div>
        <div className="exec-kpi">
          <span className="exec-kpi-value">{homeData.stats.openTickets}</span>
          <span className="exec-kpi-label">Chamados abertos</span>
        </div>
        <div className="exec-kpi exec-kpi-warning">
          <span className="exec-kpi-value">{homeData.stats.expiringContracts}</span>
          <span className="exec-kpi-label">Contratos vencendo em 30 dias</span>
        </div>
      </div>

      {homeData.personalized && (
        <section className="exec-section">
          <div className="exec-section-header">
            <p className="exec-section-title">Meu Painel</p>
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
                  <span className="exec-worklist-row-date">{formatUpdatedAt(item.updatedAt)}</span>
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

      <section className="exec-section">
        <div className="exec-section-header">
          <p className="exec-section-title">Serviços</p>
        </div>
        <ServiceCatalog services={OPTIONS} popularHref={homeData.popularHref} />
      </section>

      <div className="exec-footer">
        <a href="/api/manual/pdf" target="_blank" rel="noopener noreferrer" className="exec-footer-link">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/documento-generico.png" alt="" />
          Baixar manual do processo (PDF)
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

      <footer className="exec-company-footer">
        Time de Compras 💚 · acerto.com.br · Rua Bernardo Mascarenhas, 46 - Cidade Jardim, Belo Horizonte/MG. CEP:
        30.380-010.
      </footer>
    </main>
  );
}
