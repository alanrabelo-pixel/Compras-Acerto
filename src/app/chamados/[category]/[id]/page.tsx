import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { TICKET_CATEGORIES, TICKET_STATUS_LABEL, isTicketCategorySlug } from "@/lib/tickets";
import { ChamadoHeader } from "@/components/ChamadoHeader";
import { ChamadoThread } from "@/components/ChamadoThread";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  ABERTO: "badge-info",
  EM_ANDAMENTO: "badge-warning",
  CONCLUIDO: "badge-green",
};

export default async function ChamadoDetailPage({ params }: { params: { category: string; id: string } }) {
  if (!isTicketCategorySlug(params.category)) notFound();
  const config = TICKET_CATEGORIES[params.category];

  const ticket = await prisma.simpleTicket.findUnique({
    where: { id: params.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!ticket || ticket.category !== config.enumValue) notFound();

  return (
    <>
      <ChamadoHeader categoryLabel={config.label} backHref={`/chamados/${params.category}`} backLabel="← voltar aos chamados" />
      <main className="page-narrow" style={{ paddingTop: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 className="page-title">{ticket.code}</h1>
            <p className="page-subtitle">{ticket.requesterName} · {ticket.requesterEmail}</p>
          </div>
          <span className={`badge ${STATUS_BADGE[ticket.status] ?? "badge-neutral"}`}>{TICKET_STATUS_LABEL[ticket.status]}</span>
        </div>

        <section className="card section-gap">
          <h2 className="card-title">Descrição</h2>
          <p style={{ fontSize: 12.5, margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{ticket.description}</p>
        </section>

        {ticket.supplierName && (
          <section className="card section-gap">
            <h2 className="card-title">Contato do fornecedor</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", fontSize: 12.5 }}>
              <p style={{ margin: 0 }}><span className="text-muted">Fornecedor:</span> {ticket.supplierName}</p>
              {ticket.supplierContactName && (
                <p style={{ margin: 0 }}><span className="text-muted">Contato:</span> {ticket.supplierContactName}{ticket.supplierContactRole ? ` — ${ticket.supplierContactRole}` : ""}</p>
              )}
              {ticket.supplierContactEmail && (
                <p style={{ margin: 0 }}><span className="text-muted">E-mail:</span> {ticket.supplierContactEmail}</p>
              )}
              {ticket.supplierContactPhone && (
                <p style={{ margin: 0 }}><span className="text-muted">Telefone:</span> {ticket.supplierContactPhone}</p>
              )}
            </div>
          </section>
        )}

        <ChamadoThread
          ticketId={ticket.id}
          status={ticket.status}
          messages={ticket.messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
        />
      </main>
    </>
  );
}
