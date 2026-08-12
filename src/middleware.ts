import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Controle de acesso às telas internas.
 *
 * - /, /solicitacoes/nova, /solicitacoes/minhas, /chamados/*: qualquer pessoa
 *   autenticada (@acerto.com.br, ver signIn callback em
 *   src/app/api/auth/[...nextauth]/route.ts) pode entrar. O login é pedido
 *   já na porta de entrada (URL raiz) e vale para os três cardápios
 *   (Solicitação de Compras, Viagens Acerto, Facilities) — não é pedido de
 *   novo a cada seção, é a mesma sessão. /solicitacoes/minhas é o recorte de
 *   quem só tem o papel Solicitante (sem acesso ao quadro geral) — mostra só
 *   as próprias solicitações, ver src/app/solicitacoes/minhas/page.tsx.
 * - /solicitacoes (quadro), /solicitacoes/[id], /contratos, /dashboards:
 *   restrito a quem tem User.canViewBoard = true (ver src/lib/roles.ts) —
 *   ADMIN, COMPRADOR, APROVADOR ou CONTROLADORIA. Gerenciado em
 *   /admin/acessos (ADMIN).
 * - /admin: restrito a quem tem papel ADMIN.
 *
 * Roda no runtime edge — não pode usar Prisma diretamente. getToken() só lê
 * e valida o JWT assinado (NEXTAUTH_SECRET); os dados de canViewBoard/roles
 * já foram gravados nele pelo callback jwt() do NextAuth, que roda no
 * runtime Node e pode consultar o banco livremente.
 *
 * LOCAL_BYPASS_AUTH=true (ver .env) libera tudo sem exigir login — só para
 * esta máquina, enquanto o Google OAuth real (GOOGLE_CLIENT_ID/SECRET) não
 * está configurado. A lógica de SSO abaixo continua intacta e é a que vale
 * assim que a flag voltar para "false".
 */
export async function middleware(req: NextRequest) {
  if (process.env.LOCAL_BYPASS_AUTH === "true") {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;

  if (
    pathname === "/" ||
    pathname.startsWith("/solicitacoes/nova") ||
    pathname.startsWith("/solicitacoes/minhas") ||
    pathname.startsWith("/chamados")
  ) {
    const token = await getToken({ req });
    if (!token) return signInRedirect(req);
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    const token = await getToken({ req });
    if (!token) return signInRedirect(req);
    if (!Array.isArray(token.roles) || !token.roles.includes("ADMIN")) {
      return NextResponse.redirect(new URL("/sem-acesso", req.url));
    }
    return NextResponse.next();
  }

  const token = await getToken({ req });
  if (!token) return signInRedirect(req);
  if (!token.canViewBoard) {
    return NextResponse.redirect(new URL("/sem-acesso", req.url));
  }
  return NextResponse.next();
}

function signInRedirect(req: NextRequest) {
  const signInUrl = new URL("/login", req.url);
  signInUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: ["/", "/solicitacoes/:path*", "/chamados/:path*", "/contratos/:path*", "/dashboards/:path*", "/admin/:path*"],
};
