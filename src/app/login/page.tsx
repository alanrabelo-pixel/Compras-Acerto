import { GoogleSignInButton } from "@/components/GoogleSignInButton";

// Mapeia os códigos de erro que o NextAuth anexa na URL (?error=...) —
// AccessDenied é o caso real hoje: o callback signIn() em src/lib/auth.ts
// rejeita qualquer e-mail fora de @acerto.com.br.
const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "Esse e-mail não tem acesso — o Compras é restrito a contas @acerto.com.br. Entre com sua conta corporativa da Acerto.",
  Configuration: "O login está com um problema de configuração. Avise o time de TI.",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; callbackUrl?: string };
}) {
  const callbackUrl = searchParams.callbackUrl ?? "/";
  const errorMessage = searchParams.error
    ? ERROR_MESSAGES[searchParams.error] ?? "Não foi possível entrar. Tente novamente."
    : null;

  return (
    <main className="login-page">
      <div className="login-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/acerto-logo.svg" alt="Acerto" className="login-logo" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/alai-logo.svg" alt="alAi" className="login-alai-logo" />
        <p className="login-tagline">Certo, com inteligência.</p>
        <p className="login-subtitle">Acesso restrito a contas corporativas @acerto.com.br.</p>

        {errorMessage && <p className="hint-box hint-box-danger login-error">{errorMessage}</p>}

        <GoogleSignInButton callbackUrl={callbackUrl} />
      </div>
      <p className="login-footer">Time de Compras 💚 · acerto.com.br</p>
    </main>
  );
}
