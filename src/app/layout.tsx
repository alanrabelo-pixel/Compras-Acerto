import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { rotuloDoAmbiente, tituloDaAba } from "@/lib/ambiente";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  // Fora de produção o título vira "[SANDBOX] Acerto Compras" (ver
  // src/lib/ambiente.ts). É a única marca que aparece com a aba em segundo
  // plano, que é onde a confusão entre os dois ambientes começa.
  title: tituloDaAba("Acerto Compras"),
  description: "Sistema de processo de compras da Acerto (Compras | F&NC)",
};

// Aplica o tema salvo ANTES da primeira pintura. Sem isso, a página sempre
// nasceria clara por uma fração de segundo mesmo com tema escuro escolhido
// (o "flash" clássico de FOUC). Roda como script inline (não em um useEffect,
// que só executa depois do primeiro paint); ver src/components/ThemeToggle.tsx
// para quem grava/lê a mesma chave de localStorage.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var v = localStorage.getItem("acerto-compras-theme");
    if (v === "light" || v === "dark") document.documentElement.setAttribute("data-theme", v);
  } catch (e) {}
  // O catch vazio acima é intencional e não é um erro engolido por descuido:
  // localStorage lança em navegação anônima ou com cookies bloqueados, e a
  // única consequência é a página nascer no tema claro. Não há o que registrar
  // nem o que fazer, e este script roda antes de qualquer coisa do app existir.
})();
`;

/**
 * A faixa de ambiente mora aqui, e não na casca de Compras (AppShell), porque
 * o RootLayout é o único ponto por onde passam todas as telas. Enquanto ela
 * estava no AppShell, seis telas ficavam sem aviso nenhum: a página inicial,
 * o login, o "sem acesso" e as três de Chamados, que são as que mandam e-mail
 * de confirmação (ver src/app/api/tickets/route.ts). Fora de produção esse
 * e-mail é engolido pela trava de envio (src/lib/integrations/gmail.ts), então
 * quem abrisse um chamado no Sandbox achando que era o sistema não receberia
 * nada e não teria como desconfiar.
 *
 * Server Component (sem "use client"), então rotuloDoAmbiente() lê APP_ENV no
 * servidor, como tem que ser. Em produção o rótulo é null e nem o elemento nem
 * a classe do <body> existem: o HTML fica idêntico ao de antes desta mudança.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const rotuloAmbiente = rotuloDoAmbiente();

  return (
    <html lang="pt-BR" className={montserrat.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      {/* A classe no <body> é o que devolve o espaço da faixa (que é fixed, e
          portanto fora do fluxo) e o que desce as duas barras grudentas, a
          lateral de Compras e a de topo de Chamados. Ver globals.css. */}
      <body className={rotuloAmbiente ? "com-faixa-de-ambiente" : undefined}>
        {rotuloAmbiente && (
          <div className="faixa-ambiente" title={`${rotuloAmbiente}: ambiente de testes, não é produção.`}>
            {/* O mesmo triângulo do lucide (AlertTriangle), desenhado à mão em
                vez de importado. Os ícones do lucide são Client Components, e
                aqui o import ficaria no layout raiz, ou seja, em TODAS as
                telas, inclusive no login, que hoje não carrega JS de
                componente nenhum. Um aviso de 13px não justifica isso. */}
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
            <strong className="faixa-ambiente-rotulo">{rotuloAmbiente}</strong>
            <span className="faixa-ambiente-texto">
              Ambiente de testes, não é produção. Nada aqui gera e-mail ou mensagem no Slack, e nada aqui vale como registro oficial.
            </span>
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
