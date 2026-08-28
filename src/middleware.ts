import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { bypassAuthAtivo } from "@/lib/bypass";

/**
 * Controle de acesso às telas internas.
 *
 * - /, /solicitacoes/nova, /solicitacoes/minhas, /chamados/*: qualquer pessoa
 *   autenticada (@acerto.com.br, ver signIn callback em
 *   src/app/api/auth/[...nextauth]/route.ts) pode entrar. O login é pedido
 *   já na porta de entrada (URL raiz) e vale para os três cardápios
 *   (Solicitação de Compras, Viagens Acerto, Facilities), não é pedido de
 *   novo a cada seção, é a mesma sessão. /solicitacoes/minhas é o recorte de
 *   quem só tem o papel Solicitante (sem acesso ao quadro geral): mostra só
 *   as próprias solicitações, ver src/app/solicitacoes/minhas/page.tsx.
 * - /solicitacoes (quadro), /solicitacoes/[id], /contratos, /dashboards:
 *   restrito a quem tem User.canViewBoard = true (ver src/lib/roles.ts):
 *   ADMIN, COMPRADOR, APROVADOR ou CONTROLADORIA. Gerenciado em
 *   /admin/acessos (ADMIN).
 * - /admin: restrito a quem tem papel ADMIN.
 *
 * Roda no runtime edge, então não pode usar Prisma diretamente. getToken() só lê
 * e valida o JWT assinado (NEXTAUTH_SECRET); os dados de canViewBoard/roles
 * já foram gravados nele pelo callback jwt() do NextAuth, que roda no
 * runtime Node e pode consultar o banco livremente.
 *
 * LOCAL_BYPASS_AUTH=true (ver .env) libera tudo sem exigir login, só para
 * esta máquina, enquanto o Google OAuth real (GOOGLE_CLIENT_ID/SECRET) não
 * está configurado. A lógica de SSO abaixo continua intacta e é a que vale
 * assim que a flag voltar para "false".
 */
/**
 * Rotas de API que se autenticam sozinhas, por token de máquina ou assinatura,
 * e portanto não podem exigir sessão de usuário:
 * - /api/auth: o próprio NextAuth (exigir sessão aqui impediria o login).
 * - /api/cron: Bearer CRON_SECRET, chamado por agendador externo.
 * - /api/erp: Bearer ERP_API_KEY, chamado pelo ERP.
 * - /api/slack: assinatura HMAC do Slack, chamado pelo webhook.
 */
const API_COM_AUTENTICACAO_PROPRIA = ["/api/auth", "/api/cron", "/api/erp", "/api/slack"];

/**
 * Token utilizável: existe, a conta não foi desativada, e a sessão não passou
 * do teto absoluto (ver SESSAO_TETO_ABSOLUTO_MS em src/lib/auth.ts — marcado
 * no próprio token pelo callback jwt, sem precisar o middleware saber a
 * regra). Mesmo critério nas quatro checagens abaixo.
 */
function tokenValido(token: Record<string, unknown> | null): boolean {
  return !!token && !token.desativado && !token.sessaoExpirada;
}

export async function middleware(req: NextRequest) {
  if (bypassAuthAtivo()) {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;

  // As rotas de API ficavam FORA do matcher, então nenhuma passava por aqui e
  // cada uma precisava se defender sozinha. A maioria não se defendia: dava
  // para baixar qualquer anexo, exportar a base inteira em Excel e criar
  // solicitação sem autenticação nenhuma. Agora a sessão é exigida na porta.
  //
  // Exige apenas sessão, não canViewBoard: quem só tem o papel Solicitante
  // precisa conseguir abrir solicitação e chamado. A autorização por papel
  // continua sendo responsabilidade de cada rota.
  if (pathname.startsWith("/api/")) {
    if (API_COM_AUTENTICACAO_PROPRIA.some((prefixo) => pathname.startsWith(prefixo))) {
      return NextResponse.next();
    }
    const token = await getToken({ req });
    if (!tokenValido(token)) {
      // Rota de API responde 401 em JSON. Redirecionar para o login, como as
      // páginas fazem, devolveria HTML para quem esperava JSON e quebraria o
      // cliente com erro de parse em vez de uma mensagem clara.
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (
    pathname === "/" ||
    pathname.startsWith("/solicitacoes/nova") ||
    pathname.startsWith("/solicitacoes/minhas") ||
    pathname.startsWith("/chamados")
  ) {
    const token = await getToken({ req });
    if (!tokenValido(token)) return signInRedirect(req);
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    const token = await getToken({ req });
    if (!tokenValido(token)) return signInRedirect(req);
    if (!Array.isArray(token!.roles) || !token!.roles.includes("ADMIN")) {
      return NextResponse.redirect(new URL("/sem-acesso", req.url));
    }
    return NextResponse.next();
  }

  const token = await getToken({ req });
  if (!tokenValido(token)) return signInRedirect(req);
  if (!token!.canViewBoard) {
    return NextResponse.redirect(new URL("/sem-acesso", req.url));
  }
  return NextResponse.next();
}

function signInRedirect(req: NextRequest) {
  const signInUrl = new URL("/login", req.url);
  // pathname + search, não só pathname. O e-mail de renovação de contrato manda
  // para /solicitacoes/nova?origemContrato=<id>, prometendo o formulário já
  // preenchido. Quem clica vindo do Gmail costuma estar sem sessão viva, e a
  // query era descartada aqui: depois do login a pessoa aterrissava no
  // formulário em branco, que é exatamente o defeito que o pré-preenchimento
  // tinha ido corrigir. Continua sendo caminho relativo, então o NextAuth
  // mantém a checagem de mesma origem.
  signInUrl.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: [
    "/",
    "/solicitacoes/:path*",
    "/chamados/:path*",
    "/contratos/:path*",
    "/dashboards/:path*",
    "/admin/:path*",
    "/api/:path*",
  ],
};
