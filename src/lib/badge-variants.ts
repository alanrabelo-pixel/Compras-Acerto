import type { BadgeVariant } from "@/components/ui";

// Mapas de cor por domínio (prioridade de solicitação, status de contrato,
// status de chamado) — antes redeclarados em cada página que precisava de um
// <Badge>, com o risco de divergir (ex: PRIORITY_BADGE tinha 4 cópias).
export const PRIORITY_BADGE_VARIANT: Record<string, BadgeVariant> = {
  CRITICA: "danger",
  ALTA: "warning",
  MEDIA: "info",
  BAIXA: "neutral",
};

export const CONTRACT_STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
  ATIVO: "green",
  RENOVACAO_EM_ANDAMENTO: "warning",
  CANCELADO: "danger",
};

export const TICKET_STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
  ABERTO: "info",
  EM_ANDAMENTO: "warning",
  CONCLUIDO: "green",
};
