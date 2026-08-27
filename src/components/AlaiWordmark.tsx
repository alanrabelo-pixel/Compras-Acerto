// Logo completa da alAi (ícone + palavra), inline em vez de <img src="/brand/alai-logo.svg">.
//
// POR QUÊ. O arquivo público tem o traço do wordmark em #14181c fixo — em
// qualquer fundo escuro (tema escuro do sistema, ou uma superfície escura
// mesmo no tema claro) o texto "alAi" desaparece, porque a cor do traço e a
// do fundo ficam quase iguais. O ícone (quadrado arredondado + check) não tem
// esse problema: ele já carrega seu próprio fundo escuro fixo, então funciona
// em qualquer página. Só o wordmark precisa acompanhar o tema.
//
// Em vez de um selo claro atrás do SVG (correção aplicada antes em
// .login-alai-badge / .form-brand-alai-badge), o traço do wordmark usa
// var(--ink) — a mesma variável de texto que já inverte entre os temas em
// globals.css — e o SVG passa a resolver sozinho, em qualquer lugar que for
// usado (login, Nova Solicitação, as duas barras de topo).
export function AlaiWordmark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 130"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="alAi"
    >
      <defs>
        <linearGradient id="alaiWordmarkSparkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#33E37A" />
          <stop offset="100%" stopColor="#17B84F" />
        </linearGradient>
      </defs>
      <rect x="5" y="5" width="120" height="120" rx="26" fill="#14181C" />
      <path d="M29,69 L53,95 L103,35" fill="none" stroke="#25D366" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
      <path
        transform="translate(107,23) scale(0.95)"
        d="M0,-15 C2,-4 4,-2 15,0 C4,2 2,4 0,15 C-2,4 -4,2 -15,0 C-4,-2 -2,-4 0,-15 Z"
        fill="url(#alaiWordmarkSparkGrad)"
      />
      <g transform="translate(165,10)" fill="none" stroke="var(--ink)" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="31" cy="65" r="31" />
        <path d="M62,34 L62,96" />
        <path d="M105,4 L105,96" />
        <path d="M188,4 L148,96 M188,4 L228,96 M163.7,60 L212.3,60" />
        <path d="M274,34 L274,96" />
      </g>
      <path
        d="M0,-15 C2,-4 4,-2 15,0 C4,2 2,4 0,15 C-2,4 -4,2 -15,0 C-4,-2 -2,-4 0,-15 Z"
        fill="url(#alaiWordmarkSparkGrad)"
        transform="translate(439,27) rotate(15) scale(0.55)"
      />
    </svg>
  );
}
