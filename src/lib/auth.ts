import { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/db";
import { assertBypassNaoEstaEmProducao } from "@/lib/bypass";
import { validarAmbiente } from "@/lib/env";

// Conferências de inicialização. Ficam aqui, e não no middleware, porque este
// módulo roda no runtime Node e é importado por todo caminho autenticado;
// lançar no runtime edge derrubaria a aplicação com um erro difícil de ler.
//
// A primeira falha alto se LOCAL_BYPASS_AUTH subir junto com NODE_ENV=production.
// A proteção efetiva contra isso é o bypassAuthAtivo() devolver false em
// produção; o alarme existe para ninguém operar achando que o bypass vale.
assertBypassNaoEstaEmProducao();
validarAmbiente();

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
// Resposta ao achado de DAST "Sessão de autenticação sem expiração adequada"
// (25/08/2026): antes, session.maxAge SOZINHO fazia as duas coisas ao mesmo
// tempo (janela de inatividade E teto absoluto), com um valor fixo de 8h que
// não deslizava nunca (ver comentário em session.maxAge abaixo — o app não
// tinha SessionProvider, então o cookie nunca era reemitido antes de expirar).
//
// Agora são dois mecanismos independentes:
// - session.maxAge = janela de INATIVIDADE (desliza a cada renovação, ver
//   AuthSessionProvider + session.updateAge).
// - SESSAO_TETO_ABSOLUTO_MS = teto fixo desde o login, checado abaixo via
//   token.loginAt, que NÃO desliza mesmo com uso contínuo.
const SESSAO_TETO_ABSOLUTO_MS = 8 * 60 * 60 * 1000;

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
    async jwt({ token, user }) {
      // `user` só vem preenchido na chamada de login (nunca nas renovações
      // seguintes) — é o único momento seguro para carimbar o início da
      // sessão para o teto absoluto abaixo.
      if (user) {
        token.loginAt = Date.now();
      }
      if (typeof token.loginAt === "number" && Date.now() - token.loginAt > SESSAO_TETO_ABSOLUTO_MS) {
        // Teto absoluto vencido: mata a sessão mesmo com uso contínuo,
        // sem precisar consultar o banco. Só um novo login zera loginAt.
        token.userId = undefined;
        token.roles = [];
        token.canViewBoard = false;
        token.sessaoExpirada = true;
        return token;
      }
      if (token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
          include: { roles: true },
        });
        // `active` era checado só no signIn, então desativar alguém em
        // /admin/acessos bloqueava logins novos mas não encerrava a sessão em
        // curso. E quando o usuário sumia do banco, o `if (dbUser)` deixava as
        // reivindicações antigas intactas no token, que é o pior caso: papéis
        // de quem já não deveria ter acesso continuavam valendo.
        if (!dbUser || !dbUser.active) {
          token.userId = undefined;
          token.roles = [];
          token.canViewBoard = false;
          token.desativado = true;
          return token;
        }
        token.userId = dbUser.id;
        token.roles = dbUser.roles.map((r) => r.role);
        token.canViewBoard = dbUser.canViewBoard;
        token.desativado = false;
      }
      return token;
    },
    async session({ session }) {
      if (session.user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: session.user.email },
          include: { roles: true },
        });
        const user = session.user as { id?: string; roles?: string[]; canViewBoard?: boolean; avatarUrl?: string | null };

        // Este callback consulta o banco a cada chamada, então é aqui que a
        // revogação vale imediatamente para as rotas de API, que usam
        // getServerSession. Sem id, requireRole responde "Não autenticado".
        if (!dbUser || !dbUser.active) {
          user.id = undefined;
          user.roles = [];
          user.canViewBoard = false;
          user.avatarUrl = null;
          return session;
        }

        user.id = dbUser.id;
        user.roles = dbUser.roles.map((r) => r.role);
        // Sem cair para token.canViewBoard: esse era o valor velho gravado no
        // cookie, exatamente o que precisa parar de valer quando o acesso muda.
        user.canViewBoard = dbUser.canViewBoard;
        user.avatarUrl = dbUser.avatarUrl ?? null;
      }
      return session;
    },
  },
  // maxAge aqui é a janela de INATIVIDADE (30min), não mais o teto absoluto —
  // esse virou SESSAO_TETO_ABSOLUTO_MS, checado no callback jwt via
  // token.loginAt. Precisa do AuthSessionProvider (src/app/layout.tsx)
  // chamando GET /api/auth/session com frequência para deslizar de verdade;
  // sem ele, este maxAge sozinho derrubaria a sessão em 30min mesmo com uso
  // contínuo, porque nada reemitiria o cookie antes de expirar.
  //
  // updateAge baixo (bem menor que maxAge) para a reemissão dar conta da
  // janela de 30min com folga, em vez de só reemitir perto do fim dela.
  //
  // O middleware continua rodando no runtime edge, decidindo pelo conteúdo do
  // cookie sem consultar o banco: enquanto o token não é renovado ele carrega
  // os papéis antigos. Encurtar a validade limita essa janela; o callback jwt
  // acima zera as reivindicações assim que o token é renovado.
  session: { strategy: "jwt", maxAge: 30 * 60, updateAge: 5 * 60 },
};
