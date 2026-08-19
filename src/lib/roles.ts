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

/**
 * Os 11 papéis, separados pelo que cada grupo decide.
 *
 * A separação não é cosmética: o primeiro grupo determina o que a pessoa VÊ
 * (canViewBoard sai dele), o segundo determina em que etapa ela pode AGIR.
 * Misturar os onze numa lista só apagaria essa diferença.
 *
 * Os seis do segundo grupo não tinham tela nenhuma: apareciam em /admin/acessos
 * como texto sem edição, e a única forma de tornar alguém Fiscal ou Tesouraria
 * era mexer direto no banco. São papéis com poder real sobre dinheiro e sobre
 * o jurídico, então ficar fora da interface é uma lacuna de operação, não um
 * detalhe.
 */
export const ACCESS_ROLES: { role: RoleName; label: string }[] = [
  { role: "ADMIN", label: "Admin" },
  { role: "COMPRADOR", label: "Compras" },
  { role: "SOLICITANTE", label: "Solicitante" },
  { role: "APROVADOR", label: "Aprovador" },
  { role: "CONTROLADORIA", label: "Controladoria" },
];

export const STAGE_ROLES: { role: RoleName; label: string; etapa: string }[] = [
  { role: "JURIDICO", label: "Jurídico", etapa: "etapa 9" },
  { role: "PRIVACIDADE", label: "Privacidade", etapa: "etapa 5, Due Diligence" },
  { role: "FISCAL", label: "Fiscal", etapa: "etapa 13" },
  { role: "TESOURARIA", label: "Tesouraria", etapa: "etapa 14" },
  { role: "COORDENACAO", label: "Coordenação", etapa: "exceção orçamentária, Nível 1" },
  { role: "GERENTE_FNC", label: "Gerente F&NC", etapa: "exceção orçamentária, Níveis 2 e 3" },
];

/** Todos os papéis administráveis pela tela de Acessos. */
export const ALL_MANAGED_ROLES: RoleName[] = [
  ...ACCESS_ROLES.map((r) => r.role),
  ...STAGE_ROLES.map((r) => r.role),
];
