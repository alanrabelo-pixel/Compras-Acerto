"use client";

import { SessionProvider } from "next-auth/react";

/**
 * Habilita a renovação deslizante da sessão (resposta ao achado de DAST
 * "Sessão de autenticação sem expiração adequada", 25/08/2026).
 *
 * O NextAuth só reemite o cookie de sessão quando algo chama
 * GET /api/auth/session dentro da janela de renovação (ver session.updateAge
 * em src/lib/auth.ts) — sem este provider, nada no app fazia essa chamada, e
 * a sessão nunca deslizava: só expirava no teto fixo, de uma vez.
 *
 * refetchInterval curto garante que a consulta aconteça com frequência
 * suficiente para a janela de inatividade (30 minutos) ser respeitada com boa
 * precisão enquanto a aba estiver aberta; refetchOnWindowFocus cobre quem
 * deixa a aba em segundo plano e volta depois.
 */
export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={60} refetchOnWindowFocus>
      {children}
    </SessionProvider>
  );
}
