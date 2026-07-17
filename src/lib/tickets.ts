import type { TicketCategory } from "@prisma/client";

/**
 * Configuração dos chamados simples (Viagens Acerto / Facilities) — fluxo
 * enxuto por fora do processo de Compras: sem alçada, sem etapas, só um
 * status simples e um histórico de mensagens. O segmento de URL (chave deste
 * objeto) é o que aparece em /chamados/[category].
 */
export const TICKET_CATEGORIES = {
  viagens: { enumValue: "VIAGENS" as TicketCategory, label: "Viagens Acerto", prefix: "VG" },
  facilities: { enumValue: "FACILITIES" as TicketCategory, label: "Facilities", prefix: "FC" },
} as const;

export type TicketCategorySlug = keyof typeof TICKET_CATEGORIES;

export function isTicketCategorySlug(value: string): value is TicketCategorySlug {
  return value in TICKET_CATEGORIES;
}

export const TICKET_STATUS_LABEL: Record<string, string> = {
  ABERTO: "Aberto",
  EM_ANDAMENTO: "Em Andamento",
  CONCLUIDO: "Concluído",
};
