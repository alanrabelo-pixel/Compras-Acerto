import { RoleName } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * RBAC: a identidade de quem age em cada rota vem do próprio corpo da
 * requisição (buyerId, approverId, actorId etc.). Este helper garante que
 * esse usuário realmente possua um dos papéis exigidos para a ação,
 * consultando UserRole.
 *
 * Na maioria dos pontos de chamada, o id representa "quem está realizando
 * esta ação agora" (self), ex: buyerId na Triagem, actorId no Jurídico.
 * Com LOCAL_BYPASS_AUTH="true" (ver .env e middleware.ts), não há sessão
 * real ainda: o id enviado no corpo é confiado diretamente, como antes.
 * Assim que o SSO estiver ligado (LOCAL_BYPASS_AUTH removido/false, ver
 * CHECKLIST-GOOGLE-OAUTH.md), o caso "self" passa a exigir que o id
 * reivindicado no corpo bata com quem de fato está autenticado na sessão.
 * Sem isso, qualquer pessoa poderia agir em nome de outra só trocando o id
 * enviado na requisição.
 *
 * Exceção: alguns pontos de chamada usam o id para uma ATRIBUIÇÃO a
 * terceiros, não para identificar quem está clicando agora. Ex: o
 * `approverId` em POST /api/requests/[id]/aprovacao é o aprovador para quem
 * o comprador está roteando a decisão, não necessariamente quem está
 * logado. Esses pontos devem passar `{ requireSelf: false }` explicitamente:
 * o papel do alvo ainda é validado, só a checagem de identidade é pulada.
 */
export async function requireRole(
  userId: string | undefined | null,
  allowed: RoleName[],
  options: { requireSelf?: boolean } = {}
): Promise<string | null> {
  const { requireSelf = true } = options;
  if (!userId) return "Usuário responsável pela ação não informado.";

  if (requireSelf && process.env.LOCAL_BYPASS_AUTH !== "true") {
    const session = await getServerSession(authOptions);
    const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
    if (!sessionUserId) return "Não autenticado.";
    if (sessionUserId !== userId) return "Você não pode realizar esta ação em nome de outra pessoa.";
  }

  const roles = await prisma.userRole.findMany({ where: { userId } });
  const roleNames = roles.map((r) => r.role);

  if (roleNames.includes("ADMIN")) return null;
  if (roleNames.some((r) => allowed.includes(r))) return null;

  return `Usuário não tem papel necessário para esta ação (esperado: ${allowed.join(" ou ")}).`;
}
