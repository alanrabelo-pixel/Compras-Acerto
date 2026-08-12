import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { TICKET_CATEGORIES, TICKET_STATUS_LABEL, isTicketCategorySlug } from "@/lib/tickets";
import { resolveChamadoViewer } from "@/lib/chamados-viewer";
import { ChamadoHeader } from "@/components/ChamadoHeader";
import { WarningNotice } from "@/components/ui";
import type { TicketStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUSES: TicketStatus[] = ["ABERTO", "EM_ANDAMENTO", "CONCLUIDO"];

// Mesmo problema de escala que o Kanban de Solicitações já resolveu (ver
// solicitacoes/page.tsx): sem cap, uma coluna com centenas de chamados
// carregaria tudo de uma vez. Cap por coluna + contagem real via groupBy
// (o badge nunca mente, mesmo quando corta a lista exibida).
const CAP_PER_STATUS = 20;

export default async function ChamadosBoardPage({
  params, searchParams,
}: { params: { category: string }; searchParams: { userId?: string } }) {
  if (!isTicketCategorySlug(params.category)) notFound();
  const config = TICKET_CATEGORIES[params.category];
  const viewer = await resolveChamadoViewer(searchParams.userId);

  // Quem só tem o papel Solicitante (sem canViewBoard) vê só os próprios
  // chamados — mesmo recorte de Minhas Solicitações, ver src/lib/roles.ts.
  const where = {
    category: config.enumValue,
    ...(viewer.showFullBoard ? {} : { requesterEmail: viewer.email }),
  } as const;

  const [statusCounts, perStatus] = await Promise.all([
    prisma.simpleTicket.groupBy({ by: ["status"], where, _count: { _all: true } }),
    Promise.all(
      STATUSES.map((status) =>
        prisma.simpleTicket.findMany({ where: { ...where, status }, orderBy: { createdAt: "desc" }, take: CAP_PER_STATUS })
      )
    ),
  ]);
  const statusCountMap = new Map(statusCounts.map((c) => [c.status, c._count._all]));
  const tickets = perStatus.flat();
  const totalCount = statusCounts.reduce((sum, c) => sum + c._count._all, 0);

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
            <p className="page-subtitle">{totalCount} chamado(s) {viewer.showFullBoard ? "no total" : "seus"}</p>
          </div>
          <a href={`/chamados/${params.category}/novo`} className="btn btn-primary">+ Novo Chamado</a>
        </div>

        {params.category === "viagens" && (
          <WarningNotice className="section-gap">
            Este canal é só para resolver problemas com viagens (dúvidas, imprevistos, alterações). Para solicitar
            passagens aéreas, rodoviárias ou hospedagem, use o <strong>Onfly</strong> em{" "}
            <a href="https://app.onfly.com" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", fontWeight: 700 }}>
              app.onfly.com
            </a>
            .
          </WarningNotice>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginTop: 22 }}>
          {STATUSES.map((status) => {
            const items = byStatus.get(status) ?? [];
            const statusTotal = statusCountMap.get(status) ?? items.length;
            return (
              <div key={status} style={{ background: "var(--surface-muted)", borderRadius: 14, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 4px 10px" }}>
                  <h2 style={{ fontSize: 12.5, fontWeight: 700, margin: 0 }}>{TICKET_STATUS_LABEL[status]}</h2>
                  <span className="badge badge-neutral">{statusTotal}</span>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {items.map((t) => (
                    <a key={t.id} href={`/chamados/${params.category}/${t.id}`} className="card" style={{ padding: 12, textDecoration: "none", color: "inherit", display: "block" }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--acerto-green-dark)", marginBottom: 6 }}>{t.code}</div>
                      <p style={{ margin: "0 0 8px", fontSize: 12.5, lineHeight: 1.35, color: "var(--ink)" }}>
                        {t.description.length > 100 ? `${t.description.slice(0, 100)}…` : t.description}
                      </p>
                      <div style={{ fontSize: 11, color: "var(--ink-muted)" }}>
                        {t.requesterName}{(t.supplierName || t.contractSupplierName) ? ` · ${t.supplierName || t.contractSupplierName}` : ""}
                      </div>
                    </a>
                  ))}
                  {items.length === 0 && <p style={{ fontSize: 11, color: "var(--ink-muted)", padding: "8px 4px" }}>Nenhum chamado aqui.</p>}
                  {statusTotal > items.length && (
                    <p style={{ fontSize: 11, color: "var(--ink-muted)", padding: "4px 4px 0", fontWeight: 600 }}>
                      +{statusTotal - items.length} chamado(s) mais antigo(s) não exibido(s)
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}
