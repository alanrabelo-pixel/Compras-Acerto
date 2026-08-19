import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canViewBoard } from "@/lib/roles";
import { bypassAuthAtivo } from "@/lib/bypass";

/**
 * Identidade de quem está vendo os chamados (Viagens/Facilities/NDA), mesmo
 * critério de canViewBoard usado em Solicitações (src/lib/roles.ts): quem só
 * tem o papel Solicitante vê apenas os próprios chamados. SimpleTicket não
 * tem FK pra User (é só requesterName/requesterEmail em texto livre, ver
 * schema.prisma), então o recorte "meu" é por e-mail, não por id.
 *
 * Tipo discriminado: showFullBoard=false SEMPRE vem com um e-mail resolvido
 * (nunca null/vazio): evita o erro de "ninguém tem acesso, então libera
 * tudo" se por algum motivo o e-mail não puder ser lido da sessão.
 */
export type ChamadoViewer = { showFullBoard: true } | { showFullBoard: false; email: string };

/**
 * `devUserId` só é honrado em LOCAL_BYPASS_AUTH, um atalho pra pré-visualizar
 * a visão de um Solicitante puro localmente (?userId=<id> de um User real),
 * nunca em produção (fora do bypass a sessão real manda, sem exceção).
 */
export async function resolveChamadoViewer(devUserId?: string): Promise<ChamadoViewer> {
  const bypass = bypassAuthAtivo();

  if (bypass) {
    if (devUserId) {
      const simulated = await prisma.user.findUnique({ where: { id: devUserId }, include: { roles: true } });
      if (simulated) {
        const showFullBoard = canViewBoard(simulated.roles.map((r) => r.role));
        return showFullBoard ? { showFullBoard: true } : { showFullBoard: false, email: simulated.email };
      }
    }
    return { showFullBoard: true };
  }

  const session = await getServerSession(authOptions);
  const user = session?.user as { email?: string | null; roles?: string[] } | undefined;
  const showFullBoard = canViewBoard(user?.roles ?? []);
  if (showFullBoard) return { showFullBoard: true };
  return { showFullBoard: false, email: user?.email ?? "" };
}
