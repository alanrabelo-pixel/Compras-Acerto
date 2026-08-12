import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TICKET_CATEGORIES, isTicketCategorySlug } from "@/lib/tickets";
import { ChamadoHeader } from "@/components/ChamadoHeader";
import { ChamadoRequestForm } from "@/components/ChamadoRequestForm";
import { NdaRequestForm } from "@/components/NdaRequestForm";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NovoChamadoPage({ params }: { params: { category: string } }) {
  if (!isTicketCategorySlug(params.category)) {
    return (
      <main className="page-narrow" style={{ paddingTop: 60, textAlign: "center" }}>
        <p>Categoria de chamado inválida.</p>
        <a href="/" className="back-link">← voltar ao menu</a>
      </main>
    );
  }
  const categorySlug = params.category;
  const config = TICKET_CATEGORIES[categorySlug];

  // Mesmo padrão de solicitacoes/nova/page.tsx: com SSO real, quem abre o
  // pedido já é conhecido pela sessão — sem sessão (LOCAL_BYPASS_AUTH), fica
  // null e o formulário (NdaRequestForm) volta a mostrar o seletor manual.
  const session = await getServerSession(authOptions);
  const sessionRequester = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, name: true, email: true },
      })
    : null;

  return (
    <>
      <ChamadoHeader categoryLabel={config.label} backHref={`/chamados/${categorySlug}`} backLabel="← voltar aos chamados" />
      <main className="page-narrow" style={{ paddingTop: 28 }}>
        <h1 className="page-title">Nova solicitação — {config.label}</h1>
        <p className="page-subtitle">
          {categorySlug === "nda"
            ? "Preencha as informações abaixo para solicitar o envio de um NDA ou tirar uma dúvida sobre um contrato ativo com fornecedor."
            : "Preencha seus dados e descreva o que você precisa."}
        </p>

        {categorySlug === "viagens" && (
          <div
            className="section-gap"
            style={{ display: "flex", gap: 8, background: "var(--warning-bg)", border: "1px solid #fbdba0", borderRadius: 10, padding: 12, fontSize: 12.5, color: "var(--warning)", lineHeight: 1.5 }}
          >
            <AlertTriangle size={15} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
            <span>
              Este canal é só para resolver problemas com viagens (dúvidas, imprevistos, alterações). Para solicitar
              passagens aéreas, rodoviárias ou hospedagem, use o <strong>Onfly</strong> em{" "}
              <a href="https://app.onfly.com" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", fontWeight: 700 }}>
                app.onfly.com
              </a>
              .
            </span>
          </div>
        )}

        {categorySlug === "nda" ? (
          <NdaRequestForm sessionRequester={sessionRequester} />
        ) : (
          <ChamadoRequestForm categorySlug={categorySlug} />
        )}
      </main>
    </>
  );
}
