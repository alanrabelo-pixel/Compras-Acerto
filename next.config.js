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
};

module.exports = nextConfig;
