import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  isAdmin: boolean;
};

/**
 * Identidade real de quem está logado — usada por qualquer recurso "pessoal"
 * de UI (avatar editável, badges de notificação) que precisa de um id de
 * User de verdade. Retorna null em bypass local (LOCAL_BYPASS_AUTH, ver
 * .env) ou sem sessão: sem isso não há um User real pra atrelar nada
 * pessoal — mesma filosofia de src/lib/home-data.ts (nunca fingir
 * personalização que não existe). AppShell/Home continuam mostrando o
 * rótulo "Modo local (sem SSO)" nesse caso, só sem avatar editável.
 */
export async function loadCurrentUser(): Promise<CurrentUser | null> {
  if (process.env.LOCAL_BYPASS_AUTH === "true") return null;

  const session = await getServerSession(authOptions);
  const user = session?.user as
    | { id?: string; name?: string | null; email?: string | null; roles?: string[]; avatarUrl?: string | null }
    | undefined;
  if (!user?.id || !user.email) return null;

  return {
    id: user.id,
    name: user.name ?? user.email,
    email: user.email,
    // Expõe a URL pública de servir a foto (não a chave interna de
    // armazenamento) — quem consome isto só precisa de um <img src>.
    avatarUrl: user.avatarUrl ? `/api/users/${user.id}/avatar` : null,
    isAdmin: user.roles?.includes("ADMIN") ?? false,
  };
}
