import type { Stage } from "@prisma/client";
import { prisma } from "@/lib/db";
import { STAGES } from "@/lib/workflow";
import { TICKET_STATUS_LABEL, CATEGORY_ENUM_TO_SLUG } from "@/lib/tickets";

const TERMINAL_STAGES: Stage[] = ["CONCLUIDO", "CANCELADO"];
const EXPIRING_WINDOW_DAYS = 30;

export type HomeActivityItem = {
  id: string;
  code: string;
  title: string;
  statusLabel: string;
  href: string;
  updatedAt: Date;
};

export type HomeStats = {
  openRequests: number;
  openTickets: number;
  expiringContracts: number;
};

export type HomeData =
  | { personalized: true; requesterName: string; items: HomeActivityItem[]; stats: HomeStats }
  | { personalized: false; stats: HomeStats };

async function loadStats(where: { requesterId?: string; requesterEmail?: string }) {
  const expiringLimit = new Date();
  expiringLimit.setDate(expiringLimit.getDate() + EXPIRING_WINDOW_DAYS);

  const [openRequests, openTickets, expiringContracts] = await Promise.all([
    prisma.purchaseRequest.count({
      where: {
        currentStage: { notIn: TERMINAL_STAGES },
        ...(where.requesterId ? { requesterId: where.requesterId } : {}),
      },
    }),
    prisma.simpleTicket.count({
      where: {
        status: { not: "CONCLUIDO" },
        ...(where.requesterEmail ? { requesterEmail: where.requesterEmail } : {}),
      },
    }),
    // Contratos vencendo é sempre um recorte organizacional (não "meu
    // contrato" — o gestor de contrato é atribuído, não necessariamente quem
    // abriu a solicitação de origem), então não é filtrado por usuário mesmo
    // no painel personalizado.
    prisma.contract.count({ where: { status: "ATIVO", renewalDate: { lte: expiringLimit } } }),
  ]);

  return { openRequests, openTickets, expiringContracts };
}

/**
 * Dados da Home — painel de "o que está acontecendo" sem precisar navegar.
 * Com sessão real (SSO), personaliza para o usuário logado (últimas
 * solicitações/chamados dele + contadores). Sem sessão real
 * (LOCAL_BYPASS_AUTH, ver .env), não há identidade confiável para filtrar
 * "minhas coisas" — em vez de inventar um usuário, cai para um recorte
 * organizacional (contadores gerais), que continua sendo informação real e
 * útil sem fingir personalização que não existe.
 */
export async function loadHomeData(userEmail: string | null): Promise<HomeData> {
  const user = userEmail
    ? await prisma.user.findUnique({ where: { email: userEmail }, select: { id: true, name: true, email: true } })
    : null;

  if (!user) {
    const stats = await loadStats({});
    return { personalized: false, stats };
  }

  const [requests, tickets, stats] = await Promise.all([
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

  return { personalized: true, requesterName: user.name, items, stats };
}
