import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Garante o papel APROVADOR a quem foi nomeado gestor de centro de custo.
 *
 * Até 21/08/2026 o seletor de gestores listava SÓ quem já tinha o papel
 * (`/api/users?role=APROVADOR`). Para tornar alguém gestor era preciso ir
 * antes em Acessos e conceder o papel, e nada na tela de Centros de Custo
 * dizia isso: a pessoa simplesmente não aparecia na lista, sem explicação.
 *
 * O seletor passou a listar todo mundo ativo, e a concessão virou consequência
 * automática da nomeação, que é o que já acontecia na prática, só que à mão e
 * em outra tela.
 *
 * NÃO REVOGA ao remover alguém de um centro de custo, de propósito: o papel
 * APROVADOR também é usado nas alçadas de valor (ApprovalLevelApprover) e no
 * fluxo de aprovação, então tirá-lo aqui poderia derrubar em silêncio uma
 * permissão concedida por outro motivo. Revogar continua sendo ato explícito,
 * em /admin/acessos.
 *
 * Idempotente: `createMany` com `skipDuplicates` deixa passar quem já tem.
 */
export async function garantirPapelDeAprovador(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];

  const jaTem = await prisma.userRole.findMany({
    where: { userId: { in: userIds }, role: "APROVADOR" },
    select: { userId: true },
  });
  const comPapel = new Set(jaTem.map((r) => r.userId));
  const concedidos = userIds.filter((id) => !comPapel.has(id));
  if (concedidos.length === 0) return [];

  await prisma.userRole.createMany({
    data: concedidos.map((userId) => ({ userId, role: "APROVADOR" as const })),
    skipDuplicates: true,
  });

  // Registrado porque é concessão de permissão acontecendo como efeito
  // colateral de outra ação: sem log, ninguém liga o papel novo à nomeação
  // que o causou.
  logger.info("papel_aprovador_concedido_por_nomeacao", {
    quantidade: concedidos.length,
    usuarios: concedidos,
    origem: "gestor de centro de custo",
  });
  return concedidos;
}
