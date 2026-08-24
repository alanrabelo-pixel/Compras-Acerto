import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// next/font/local em vez de next/font/google: o build (docker build, sem
// egress liberado pra fonts.gstatic.com na Golden Pipeline) ficava tentando
// baixar a fonte pela rede e travava por até ~30min sem erro claro, só
// esgotando o timeout. O arquivo abaixo é a mesma fonte variável (pesos
// 400–700, subset latin) que o Google Fonts servia, baixada uma vez e
// versionada no repo — zero rede no build a partir de agora.
const montserrat = localFont({
  src: "../fonts/montserrat-latin-variable.woff2",
  weight: "400 700",
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Acerto Compras",
  description: "Sistema de processo de compras da Acerto (Compras | F&NC)",
};

// Aplica o tema salvo ANTES da primeira pintura — sem isso, a página sempre
// nasceria clara por uma fração de segundo mesmo com tema escuro escolhido
// (o "flash" clássico de FOUC). Roda como script inline (não em um useEffect,
// que só executa depois do primeiro paint) — ver src/components/ThemeToggle.tsx
// para quem grava/lê a mesma chave de localStorage.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var v = localStorage.getItem("acerto-compras-theme");
    if (v === "light" || v === "dark") document.documentElement.setAttribute("data-theme", v);
  } catch (e) {}
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
