/** @type {import('next').NextConfig} */
const nextConfig = {
  // Gera .next/standalone — só os arquivos e node_modules de fato usados em
  // produção, sem precisar copiar node_modules/ inteiro pra dentro da imagem
  // Docker. Reduz bastante o tamanho da imagem final (ver Dockerfile).
  output: "standalone",

  // Habilita src/instrumentation.ts, que roda UMA vez quando o servidor sobe.
  // No Next 14 isso ainda é experimental; virou estável no 15. É o único
  // gancho que existe para "execute isto antes de atender a primeira
  // requisição", e é disso que a conferência de ambiente precisa para falhar
  // no lugar certo. Ver src/instrumentation.ts.
  experimental: {
    instrumentationHook: true,
  },

  // Cabeçalhos de segurança ausentes, achado de MÉDIO/BAIXO risco do DAST de
  // 25/08/2026 (CSP, X-Frame-Options, X-Content-Type-Options). Nenhum deles
  // existia porque ninguém tinha configurado headers() ainda — não é omissão
  // deliberada, é lacuna mesmo.
  //
  // A CSP não usa nonce: o app não tem infraestrutura de nonce por requisição
  // (precisaria de middleware gerando um por request e injetando tanto no
  // cabeçalho quanto nos scripts do Next), e sem isso 'unsafe-inline' em
  // script-src é necessário pelo próprio script de tema em src/app/layout.tsx
  // e pelos scripts que o Next injeta para hidratação. Ainda assim a CSP
  // reduz o impacto de um XSS real: bloqueia carregar script/imagem/conexão
  // de qualquer domínio externo, e frame-ancestors impede embutir a
  // aplicação em iframe de terceiro (mesmo objetivo do X-Frame-Options
  // abaixo, mantido para navegador antigo que não lê frame-ancestors).
  async headers() {
    // 'unsafe-eval' só em desenvolvimento: o `next dev` usa eval() para os
    // module wrappers com source map rápido (é assim que o HMR funciona), e
    // sem isso o script nem carrega — quebra clique/hidratação de qualquer
    // Client Component, não só um aviso de console. O build de produção
    // (`next build`/`next start`) não usa eval nos chunks, então lá a CSP
    // continua exatamente tão restrita quanto antes.
    const scriptSrc = process.env.NODE_ENV === "production" ? "script-src 'self' 'unsafe-inline'" : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
