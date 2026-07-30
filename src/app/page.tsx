import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadHomeData } from "@/lib/home-data";

const OPTIONS = [
  {
    href: "/solicitacoes",
    eyebrow: "Compras",
    title: "Solicitação de Compras",
    description: "Abra e acompanhe processos de compra — da solicitação até o pagamento e mapeamento de contrato.",
    illustration: "/illustrations/cartao-dinheiro.png",
  },
  {
    href: "/chamados/viagens",
    eyebrow: "Viagens",
    title: "Viagens Acerto",
    description: "Tire dúvidas ou resolva imprevistos de uma viagem a trabalho. Para passagens e hospedagem, use o Onfly (app.onfly.com).",
    illustration: "/illustrations/homem-escada.png",
  },
  {
    href: "/chamados/facilities",
    eyebrow: "Facilities",
    title: "Facilities",
    description: "Chamados de manutenção, infraestrutura do escritório e materiais.",
    illustration: "/illustrations/dupla-parceria.png",
  },
  {
    href: "/chamados/nda",
    eyebrow: "Jurídico",
    title: "Envio de NDA (Termo de Confidencialidade)",
    description: "Solicite o envio de um termo de confidencialidade para formalizar uma negociação com fornecedor ou parceiro.",
    illustration: "/illustrations/computador-digital.png",
  },
];

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  const homeData = await loadHomeData(session?.user?.email ?? null);

  return (
    <main className="landing">
      <section className="landing-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/sorriso-verde.png" alt="" className="landing-hero-sorriso" />
        <div className="landing-hero-text">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/acerto-logo.svg" alt="Acerto" className="landing-hero-logo" />
          <h1 className="landing-hero-title">O que você precisa hoje?</h1>
          <p className="landing-hero-subtitle">
            Escolha um fluxo para abrir ou acompanhar uma solicitação. Compras, Viagens Acerto, Facilities e NDA,
            tudo em um só lugar.
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/illustrations/simpatica-ola.png" alt="" className="landing-hero-illustration" />
      </section>

      <div className="home-stats" role="group" aria-label="Resumo geral">
        <div className="home-stat">
          <span className="home-stat-value">{homeData.stats.openRequests}</span>
          <span className="home-stat-label">Solicitações em aberto</span>
        </div>
        <div className="home-stat">
          <span className="home-stat-value">{homeData.stats.openTickets}</span>
          <span className="home-stat-label">Chamados abertos</span>
        </div>
        <div className="home-stat home-stat-warning">
          <span className="home-stat-value">{homeData.stats.expiringContracts}</span>
          <span className="home-stat-label">Contratos vencendo em 30 dias</span>
        </div>
      </div>

      {homeData.personalized && (
        <section className="home-activity">
          <h2 className="home-activity-title">Suas atividades recentes</h2>
          {homeData.items.length > 0 ? (
            <div className="home-activity-list">
              {homeData.items.map((item) => (
                <a key={item.id} href={item.href} className="home-activity-item">
                  <div className="home-activity-item-main">
                    <span className="home-activity-item-code">{item.code}</span>
                    <span className="home-activity-item-title">{item.title}</span>
                  </div>
                  <span className="badge badge-neutral">{item.statusLabel}</span>
                </a>
              ))}
            </div>
          ) : (
            <p className="home-activity-empty">
              Você ainda não tem solicitações ou chamados. Escolha um serviço abaixo para começar.
            </p>
          )}
        </section>
      )}

      <div className="landing-grid">
        {OPTIONS.map((opt) => (
          <a key={opt.href} href={opt.href} className="menu-card">
            <div className="menu-card-illustration-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={opt.illustration} alt="" className="menu-card-illustration" />
            </div>
            <span className="menu-card-eyebrow">{opt.eyebrow}</span>
            <span className="menu-card-title">{opt.title}</span>
            <p className="menu-card-desc">{opt.description}</p>
            <span className="menu-card-cta">Acessar →</span>
          </a>
        ))}
      </div>

      <div className="landing-footer">
        <a href="/api/manual/pdf" target="_blank" rel="noopener noreferrer" className="landing-footer-link">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/documento-generico.png" alt="" />
          Baixar manual do processo (PDF)
        </a>
        <a
          href="https://acerto.atlassian.net/wiki/spaces/~712020937f655593794b57918a9de7aea12eac/pages/1562738748/POL+TICA+DE+COMPRAS+V.04.25"
          target="_blank"
          rel="noopener noreferrer"
          className="landing-footer-link"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/livro-aberto.png" alt="" />
          Política de Compras
        </a>
      </div>

      <footer className="landing-company-footer">
        Time de Compras 💚 · acerto.com.br · Rua Bernardo Mascarenhas, 46 - Cidade Jardim, Belo Horizonte/MG. CEP:
        30.380-010.
      </footer>
    </main>
  );
}
