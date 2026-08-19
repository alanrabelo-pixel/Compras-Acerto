import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Acerto Compras",
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={montserrat.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
