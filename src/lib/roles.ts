import type { RoleName } from "@prisma/client";

/**
 * Papéis que dão acesso ao Quadro geral (todas as solicitações da empresa) e
 * às telas de gestão (Contratos, Dashboards), mesmo critério usado para
 * derivar User.canViewBoard em src/app/api/users/[id]/route.ts. SOLICITANTE
 * sozinho nunca entra aqui: quem só solicita não deve ver o quadro/gestão,
 * só as próprias solicitações (ver src/app/solicitacoes/minhas/page.tsx e
 * o menu lateral em AppShell.tsx).
 */
export const BOARD_ROLES: RoleName[] = ["ADMIN", "COMPRADOR", "APROVADOR", "CONTROLADORIA"];

export function canViewBoard(roles: string[]): boolean {
  return roles.some((r) => BOARD_ROLES.includes(r as RoleName));
}
