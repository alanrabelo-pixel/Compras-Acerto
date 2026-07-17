import NextAuth, { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/db";

/**
 * SSO via Google Workspace, restrito ao domínio @acerto.com.br.
 * Assunção não verificada: a Acerto permite apps internos usando OAuth do
 * Workspace sem passar por um processo de aprovação do Google Admin — validar
 * com Rafael Martins (SI e Privacidade) antes de ir a produção.
 */
export const authOptions: NextAuthOptions = {
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
      // Upsert de usuário local para manter roles/diretoria consultáveis via Prisma
      await prisma.user.upsert({
        where: { email },
        update: {},
        create: { email, name: (profile as { name?: string })?.name ?? email },
      });
      return true;
    },
    // Roda no runtime Node (API route), nunca no middleware — pode usar Prisma
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
        (session.user as { id?: string; roles?: string[]; canViewBoard?: boolean }).id = dbUser?.id;
        (session.user as { id?: string; roles?: string[]; canViewBoard?: boolean }).roles = dbUser?.roles.map((r) => r.role);
        (session.user as { id?: string; roles?: string[]; canViewBoard?: boolean }).canViewBoard = dbUser?.canViewBoard ?? Boolean(token.canViewBoard);
      }
      return session;
    },
  },
  session: { strategy: "jwt" },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
