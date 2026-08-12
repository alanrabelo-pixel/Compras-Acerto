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
  nda: { enumValue: "NDA" as TicketCategory, label: "NDA e Contratos de Fornecedores", prefix: "NDA" },
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

// Caminho inverso enumValue -> slug de URL — usado por qualquer tela que
// precise montar um link /chamados/[slug]/[id] a partir de um SimpleTicket
// (ver home-data.ts, dashboard-data.ts).
export const CATEGORY_ENUM_TO_SLUG = Object.fromEntries(
  Object.entries(TICKET_CATEGORIES).map(([slug, cfg]) => [cfg.enumValue, slug as TicketCategorySlug]),
) as Record<string, TicketCategorySlug>;
