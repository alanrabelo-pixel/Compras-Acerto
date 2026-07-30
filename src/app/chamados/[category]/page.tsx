import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { TICKET_CATEGORIES, TICKET_STATUS_LABEL, isTicketCategorySlug } from "@/lib/tickets";
import { ChamadoHeader } from "@/components/ChamadoHeader";
import type { TicketStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUSES: TicketStatus[] = ["ABERTO", "EM_ANDAMENTO", "CONCLUIDO"];

export default async function ChamadosBoardPage({ params }: { params: { category: string } }) {
  if (!isTicketCategorySlug(params.category)) notFound();
  const config = TICKET_CATEGORIES[params.category];

  const tickets = await prisma.simpleTicket.findMany({
    where: { category: config.enumValue },
    orderBy: { createdAt: "desc" },
  });

  const byStatus = new Map<TicketStatus, typeof tickets>();
  for (const t of tickets) {
    const list = byStatus.get(t.status) ?? [];
    list.push(t);
    byStatus.set(t.status, list);
  }

  return (
    <>
      <ChamadoHeader categoryLabel={config.label} backHref="/" backLabel="← voltar ao menu" />
      <main className="page" style={{ paddingTop: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <h1 className="page-title">{config.label}</h1>
            <p className="page-subtitle">{tickets.length} chamado(s) no total</p>
          </div>
          <a href={`/chamados/${params.category}/novo`} className="btn btn-primary">+ Novo Chamado</a>
        </div>

        {params.category === "viagens" && (
          <div
            style={{ marginTop: 16, background: "var(--warning-bg)", border: "1px solid #fbdba0", borderRadius: 10, padding: 12, fontSize: 12.5, color: "var(--warning)", lineHeight: 1.5 }}
          >
            ⚠ Este canal é só para resolver problemas com viagens (dúvidas, imprevistos, alterações). Para solicitar
            passagens aéreas, rodoviárias ou hospedagem, use o <strong>Onfly</strong> em{" "}
            <a href="https://app.onfly.com" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", fontWeight: 700 }}>
              app.onfly.com
            </a>
            .
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginTop: 22 }}>
          {STATUSES.map((status) => {
            const items = byStatus.get(status) ?? [];
            return (
              <div key={status} style={{ background: "var(--surface-muted)", borderRadius: 14, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 4px 10px" }}>
                  <h2 style={{ fontSize: 12.5, fontWeight: 700, margin: 0 }}>{TICKET_STATUS_LABEL[status]}</h2>
                  <span className="badge badge-neutral">{items.length}</span>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {items.map((t) => (
                    <a key={t.id} href={`/chamados/${params.category}/${t.id}`} className="card" style={{ padding: 12, textDecoration: "none", color: "inherit", display: "block" }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--acerto-green-dark)", marginBottom: 6 }}>{t.code}</div>
                      <p style={{ margin: "0 0 8px", fontSize: 12.5, lineHeight: 1.35, color: "var(--ink)" }}>
                        {t.description.length > 100 ? `${t.description.slice(0, 100)}…` : t.description}
                      </p>
                      <div style={{ fontSize: 11, color: "var(--ink-muted)" }}>
                        {t.requesterName}{t.supplierName ? ` · ${t.supplierName}` : ""}
                      </div>
                    </a>
                  ))}
                  {items.length === 0 && <p style={{ fontSize: 11, color: "var(--ink-muted)", padding: "8px 4px" }}>Nenhum chamado aqui.</p>}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}
