import type { Stage } from "@prisma/client";
import { prisma } from "@/lib/db";
import { STAGES } from "@/lib/workflow";
import { TICKET_STATUS_LABEL, CATEGORY_ENUM_TO_SLUG, TICKET_CATEGORIES, type TicketCategorySlug } from "@/lib/tickets";
import { loadPendingRequestsForUser } from "@/lib/pendencias";

const TERMINAL_STAGES: Stage[] = ["CONCLUIDO", "CANCELADO"];
const EXPIRING_WINDOW_DAYS = 30;
const POPULAR_SERVICE_WINDOW_DAYS = 30;

export type HomeActivityItem = {
  id: string;
  code: string;
  title: string;
  statusLabel: string;
  href: string;
  updatedAt: Date;
};

export type TicketCategoryCount = { slug: TicketCategorySlug; label: string; count: number };

export type HomeStats = {
  openRequests: number;
  openTickets: number;
  ticketsByCategory: TicketCategoryCount[];
  expiringContracts: number;
};

export type HomeData =
  | { personalized: true; requesterName: string; items: HomeActivityItem[]; stats: HomeStats; popularHref: string | null; pendingCount: number }
  | { personalized: false; stats: HomeStats; popularHref: string | null };

// "Mais usado" no cardápio de serviços: contagem real dos últimos 30 dias
// (não um número inventado, e não all-time: um recorte all-time deixaria o
// selo travado para sempre no serviço historicamente maior, Compras, sem
// nunca refletir o que está em alta agora). Sempre um recorte organizacional
// (não muda com sessão/usuário).
async function loadPopularServiceHref(): Promise<string | null> {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - POPULAR_SERVICE_WINDOW_DAYS);

  const [requestCount, ticketCounts] = await Promise.all([
    prisma.purchaseRequest.count({ where: { createdAt: { gte: windowStart } } }),
    prisma.simpleTicket.groupBy({ by: ["category"], _count: { _all: true }, where: { createdAt: { gte: windowStart } } }),
  ]);
  const counts: { href: string; count: number }[] = [{ href: "/solicitacoes", count: requestCount }];
  for (const t of ticketCounts) {
    const slug = CATEGORY_ENUM_TO_SLUG[t.category];
    if (slug) counts.push({ href: `/chamados/${slug}`, count: t._count._all });
  }
  const top = counts.sort((a, b) => b.count - a.count)[0];
  return top && top.count > 0 ? top.href : null;
}

async function loadStats(where: { requesterId?: string; requesterEmail?: string }) {
  const expiringLimit = new Date();
  expiringLimit.setDate(expiringLimit.getDate() + EXPIRING_WINDOW_DAYS);

  const ticketWhere = {
    status: { not: "CONCLUIDO" as const },
    ...(where.requesterEmail ? { requesterEmail: where.requesterEmail } : {}),
  };

  const [openRequests, ticketCounts, expiringContracts] = await Promise.all([
    prisma.purchaseRequest.count({
      where: {
        currentStage: { notIn: TERMINAL_STAGES },
        ...(where.requesterId ? { requesterId: where.requesterId } : {}),
      },
    }),
    prisma.simpleTicket.groupBy({ by: ["category"], where: ticketWhere, _count: { _all: true } }),
    // Contratos vencendo é sempre um recorte organizacional (não "meu
    // contrato": o gestor de contrato é atribuído, não necessariamente quem
    // abriu a solicitação de origem), então não é filtrado por usuário mesmo
    // no painel personalizado.
    prisma.contract.count({ where: { status: "ATIVO", renewalDate: { lte: expiringLimit } } }),
  ]);

  // Sempre as 3 categorias, mesmo com 0 chamados, pra "Chamados abertos"
  // mostrar a distribuição completa ao passar o mouse, não só as que tiverem
  // algo aberto no momento (ver hover breakdown em page.tsx).
  const countByCategory = new Map(ticketCounts.map((t) => [t.category, t._count._all]));
  const ticketsByCategory: TicketCategoryCount[] = (Object.keys(TICKET_CATEGORIES) as TicketCategorySlug[]).map((slug) => ({
    slug,
    label: TICKET_CATEGORIES[slug].label,
    count: countByCategory.get(TICKET_CATEGORIES[slug].enumValue) ?? 0,
  }));
  const openTickets = ticketsByCategory.reduce((sum, c) => sum + c.count, 0);

  return { openRequests, openTickets, ticketsByCategory, expiringContracts };
}

/**
 * Dados da Home: painel de "o que está acontecendo" sem precisar navegar.
 * Com sessão real (SSO), personaliza para o usuário logado (últimas
 * solicitações/chamados dele + contadores). Sem sessão real
 * (LOCAL_BYPASS_AUTH, ver .env), não há identidade confiável para filtrar
 * "minhas coisas". Em vez de inventar um usuário, cai para um recorte
 * organizacional (contadores gerais), que continua sendo informação real e
 * útil sem fingir personalização que não existe.
 */
export async function loadHomeData(userEmail: string | null): Promise<HomeData> {
  const user = userEmail
    ? await prisma.user.findUnique({
        where: { email: userEmail },
        select: { id: true, name: true, email: true, roles: { select: { role: true } } },
      })
    : null;

  if (!user) {
    const [stats, popularHref] = await Promise.all([loadStats({}), loadPopularServiceHref()]);
    return { personalized: false, stats, popularHref };
  }

  const myRoles = user.roles.map((r) => r.role);

  const [requests, tickets, stats, popularHref, pendingRequests] = await Promise.all([
    prisma.purchaseRequest.findMany({
      where: { requesterId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, code: true, shortDescription: true, currentStage: true, updatedAt: true },
    }),
    prisma.simpleTicket.findMany({
      where: { requesterEmail: user.email },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, code: true, category: true, description: true, status: true, updatedAt: true },
    }),
    loadStats({ requesterId: user.id, requesterEmail: user.email }),
    loadPopularServiceHref(),
    // Contagem real para o sino de notificações da Home, mesma lógica de
    // Minhas Pendências (src/lib/pendencias.ts), não um número fabricado.
    loadPendingRequestsForUser(user.id, myRoles),
  ]);

  const requestItems: HomeActivityItem[] = requests.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.shortDescription,
    statusLabel: STAGES[r.currentStage].label,
    href: `/solicitacoes/${r.id}`,
    updatedAt: r.updatedAt,
  }));
  const ticketItems: HomeActivityItem[] = tickets.map((t) => ({
    id: t.id,
    code: t.code,
    title: t.description.length > 70 ? `${t.description.slice(0, 70)}…` : t.description,
    statusLabel: TICKET_STATUS_LABEL[t.status] ?? t.status,
    href: `/chamados/${CATEGORY_ENUM_TO_SLUG[t.category]}/${t.id}`,
    updatedAt: t.updatedAt,
  }));

  const items = [...requestItems, ...ticketItems]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 5);

  return { personalized: true, requesterName: user.name, items, stats, popularHref, pendingCount: pendingRequests.length };
}
