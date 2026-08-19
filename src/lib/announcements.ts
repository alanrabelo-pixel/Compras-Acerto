import { prisma } from "@/lib/db";

const RECENT_WINDOW_DAYS = 7;

/**
 * Contagem para o badge do botão de foguete, sem tabela de "lido/não lido"
 * por pessoa (fora de escopo por ora), então "novo" aqui é só "publicado nos
 * últimos 7 dias", um sinal real e simples em vez de rastrear leitura
 * individual.
 */
export async function countRecentAnnouncements(): Promise<number> {
  const since = new Date();
  since.setDate(since.getDate() - RECENT_WINDOW_DAYS);
  return prisma.announcement.count({ where: { createdAt: { gte: since } } });
}
