import { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/db";

/**
 * SSO via Google Workspace, restrito ao domínio @acerto.com.br.
 *
 * Extraído de src/app/api/auth/[...nextauth]/route.ts (que hoje só re-exporta
 * o handler do NextAuth) porque o Next.js valida em build time que um
 * route.ts só exporta handlers HTTP (GET/POST/...): um export adicional
 * como `authOptions` quebra a checagem de tipos gerada
 * (.next/types/app/api/auth/[...nextauth]/route.ts) e derruba `next build`.
 *
 * Assunção não verificada: a Acerto permite apps internos usando OAuth do
 * Workspace sem passar por um processo de aprovação do Google Admin, então validar
 * com Rafael Martins (SI e Privacidade) antes de ir a produção.
 */
export const authOptions: NextAuthOptions = {
  // Tela de login com a marca da Acerto em vez da página genérica que o
  // NextAuth gera sozinho, ver src/app/login/page.tsx.
  pages: {
    signIn: "/login",
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: { hd: "acerto.com.br", prompt: "select_account" },
      },
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      const email = (profile as { email?: string })?.email ?? "";
      if (!email.endsWith("@acerto.com.br")) return false;
      const googleId = (profile as { sub?: string })?.sub;
      // Reflete criação/remoção de conta do Google Workspace: primeiro login
      // de um e-mail novo cria o User automaticamente (upsert abaixo). Uma
      // pessoa desativada em /admin/acessos (ex.: conta de e-mail excluída)
      // fica bloqueada aqui mesmo que a conta Google ainda exista. Nunca
      // apagamos o User, só marcamos active=false, preservando todo o
      // histórico de solicitações/contratos/aprovações dela.
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing && !existing.active) return false;
      await prisma.user.upsert({
        where: { email },
        // googleId é preenchido/atualizado a cada login (nunca apagado): é o
        // sinal usado em /admin/acessos para distinguir Origem SSO x Manual.
        update: googleId ? { googleId } : {},
        // Todo usuário criado via SSO entra só como SOLICITANTE: perfis
        // elevados (Comprador/Aprovador/Administrador) nunca são concedidos
        // pelo login, só por ação manual de um ADMIN em /admin/acessos.
        create: {
          email,
          name: (profile as { name?: string })?.name ?? email,
          googleId,
          roles: { create: [{ role: "SOLICITANTE" }] },
        },
      });
      return true;
    },
    // Roda no runtime Node (API route), nunca no middleware, então pode usar Prisma
    // à vontade. O que for gravado aqui fica embutido no JWT assinado que o
    // middleware (edge, sem acesso a banco) lê via getToken() para decidir
    // acesso a /solicitacoes, /contratos e /dashboards.
    async jwt({ token }) {
      if (token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
          include: { roles: true },
        });
        if (dbUser) {
          token.userId = dbUser.id;
          token.roles = dbUser.roles.map((r) => r.role);
          token.canViewBoard = dbUser.canViewBoard;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: session.user.email },
          include: { roles: true },
        });
        (session.user as { id?: string; roles?: string[]; canViewBoard?: boolean; avatarUrl?: string | null }).id = dbUser?.id;
        (session.user as { id?: string; roles?: string[]; canViewBoard?: boolean; avatarUrl?: string | null }).roles = dbUser?.roles.map((r) => r.role);
        (session.user as { id?: string; roles?: string[]; canViewBoard?: boolean; avatarUrl?: string | null }).canViewBoard = dbUser?.canViewBoard ?? Boolean(token.canViewBoard);
        (session.user as { id?: string; roles?: string[]; canViewBoard?: boolean; avatarUrl?: string | null }).avatarUrl = dbUser?.avatarUrl ?? null;
      }
      return session;
    },
  },
  session: { strategy: "jwt" },
};
