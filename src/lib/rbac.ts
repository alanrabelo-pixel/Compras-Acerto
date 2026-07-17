import { RoleName } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * RBAC mínimo: como o login (Google SSO) ainda não está com credenciais reais
 * configuradas neste ambiente, a identidade de quem age em cada rota vem do
 * próprio corpo da requisição (buyerId, approverId, actorId etc. — já
 * exigidos pelas regras de SoD). Este helper garante que esse usuário
 * realmente possua um dos papéis exigidos para a ação, consultando UserRole.
 *
 * Quando o SSO estiver ligado, o ideal é trocar a origem do userId por
 * getServerSession(authOptions) em vez de confiar no corpo da requisição.
 */
export async function requireRole(userId: string | undefined | null, allowed: RoleName[]): Promise<string | null> {
  if (!userId) return "Usuário responsável pela ação não informado.";

  const roles = await prisma.userRole.findMany({ where: { userId } });
  const roleNames = roles.map((r) => r.role);

  if (roleNames.includes("ADMIN")) return null;
  if (roleNames.some((r) => allowed.includes(r))) return null;

  return `Usuário não tem papel necessário para esta ação (esperado: ${allowed.join(" ou ")}).`;
}
