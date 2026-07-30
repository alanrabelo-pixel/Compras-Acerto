import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadHomeData } from "@/lib/home-data";
import { Badge, TableWrap, TableHeadRow, TableRow } from "@/components/ui";

const OPTIONS = [
  {
    href: "/solicitacoes",
    eyebrow: "Compras",
    title: "Solicitação de Compras",
    illustration: "/illustrations/cartao-dinheiro.png",
  },
  {
    href: "/chamados/viagens",
    eyebrow: "Viagens",
    title: "Viagens Acerto",
    illustration: "/illustrations/homem-escada.png",
  },
  {
    href: "/chamados/facilities",
    eyebrow: "Facilities",
    title: "Facilities",
    illustration: "/illustrations/dupla-parceria.png",
  },
  {
    href: "/chamados/nda",
    eyebrow: "Jurídico",
    title: "Envio de NDA (Termo de Confidencialidade)",
    illustration: "/illustrations/computador-digital.png",
  },
];

export const dynamic = "force-dynamic";

function formatUpdatedAt(date: Date) {
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  const homeData = await loadHomeData(session?.user?.email ?? null);
  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

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
        <p className="exec-topbar-meta">{today}</p>
      </header>

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
        <div className="exec-tile-grid">
          {OPTIONS.map((opt) => (
            <a key={opt.href} href={opt.href} className="exec-tile">
              <div className="exec-tile-icon-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={opt.illustration} alt="" className="exec-tile-icon" />
              </div>
              <span className="exec-tile-eyebrow">{opt.eyebrow}</span>
              <span className="exec-tile-title">{opt.title}</span>
            </a>
          ))}
        </div>
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
      </div>

      <footer className="exec-company-footer">
        Time de Compras 💚 · acerto.com.br · Rua Bernardo Mascarenhas, 46 - Cidade Jardim, Belo Horizonte/MG. CEP:
        30.380-010.
      </footer>
    </main>
  );
}
