import { ShoppingCart, Scale, Plane, ShieldCheck, KeyRound } from "lucide-react";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { AlaiWordmark } from "@/components/AlaiWordmark";

// Mapeia os códigos de erro que o NextAuth anexa na URL (?error=...).
// AccessDenied é o caso real hoje: o callback signIn() em src/lib/auth.ts
// rejeita qualquer e-mail fora de @acerto.com.br.
const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "Esse e-mail não tem acesso: o Compras é restrito a contas @acerto.com.br. Entre com sua conta corporativa da Acerto.",
  Configuration: "O login está com um problema de configuração. Avise o time de TI.",
};

// Os três blocos do produto, com o MESMO ícone e a mesma descrição que a
// tela inicial usa para eles (src/app/page.tsx) — o painel de marca do login
// é a porta de entrada, e a porta precisa dizer a verdade sobre a casa.
// Viagens e Facilities entram juntas: três destaques cabem no painel sem
// disputar espaço com o cartão de entrada; a lista completa de serviços já
// mora na própria tela inicial.
const DESTAQUES = [
  {
    icon: <ShoppingCart size={17} strokeWidth={1.75} />,
    title: "Solicitações de Compras",
    description: "Triagem, cotação, aprovação e contratos em um único fluxo, do pedido à entrega.",
  },
  {
    icon: <Scale size={17} strokeWidth={1.75} />,
    title: "Contratos e Fornecedores",
    description: "Cadastro de fornecedores, gestão de NDA e consulta de contratos ativos e fornecedores homologados.",
  },
  {
    icon: <Plane size={17} strokeWidth={1.75} />,
    title: "Viagens e Facilities",
    description: "Solicitações de viagens, Uber Corporativo, manutenção e gestão de eventos internos.",
  },
];

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
      <section className="login-brand-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/alai-mark.svg" alt="" aria-hidden="true" className="login-brand-mark" />

        <div>
          <div className="login-brand-headline-block">
            <p className="login-brand-eyebrow">Acerto Compras</p>
            <h1 className="login-brand-headline">Toda a jornada de compras da Acerto, em um só lugar.</h1>
            <p className="login-brand-sub">
              Solicitações, aprovações, contratos e chamados, centralizados em uma única plataforma,
              com a alAi acompanhando e apoiando cada etapa do processo.
            </p>
          </div>
        </div>

        <ul className="login-brand-features">
          {DESTAQUES.map((item) => (
            <li key={item.title} className="login-brand-feature">
              <span className="login-brand-feature-icon">{item.icon}</span>
              <div>
                <p className="login-brand-feature-title">{item.title}</p>
                <p className="login-brand-feature-desc">{item.description}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="login-brand-trust">
          <p className="login-brand-trust-item">
            <ShieldCheck size={15} strokeWidth={1.75} />
            Login exclusivo pela sua conta Google corporativa
          </p>
          <p className="login-brand-trust-item">
            <KeyRound size={15} strokeWidth={1.75} />
            Nenhuma senha é criada nem armazenada por este sistema
          </p>
        </div>
      </section>

      <section className="login-auth-panel">
        <div className="login-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/acerto-logo.svg" alt="Acerto" className="login-logo" />
          <AlaiWordmark className="login-alai-logo" />
          <p className="login-tagline">Certo, com inteligência.</p>
          <p className="login-subtitle">Acesso restrito a contas corporativas @acerto.com.br.</p>

          {errorMessage && <p className="hint-box hint-box-danger login-error">{errorMessage}</p>}

          <GoogleSignInButton callbackUrl={callbackUrl} />

          <p className="login-no-password">
            <KeyRound size={13} strokeWidth={1.75} />
            Sem senha: a entrada é só pela sua conta Google.
          </p>
        </div>
        <p className="login-footer">Time de Compras 💚 · acerto.com.br</p>
      </section>
    </main>
  );
}
