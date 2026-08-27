"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { signOut } from "next-auth/react";

/**
 * Sai direto, sem a tela de confirmação padrão do NextAuth (feia e fora do
 * estilo do sistema, ver /api/auth/signout). Sair é reversível — basta entrar
 * de novo — então não precisa perguntar "tem certeza".
 *
 * Client Component só por causa do signOut(); os três lugares que usam isto
 * (UserMenu, AppShell, sem-acesso) são Server Components, por isso o botão
 * mora aqui em vez de virar onClick inline em cada um.
 */
export function SignOutButton({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} {...props}>
      {children}
    </button>
  );
}
