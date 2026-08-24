/** @type {import('next').NextConfig} */
const nextConfig = {
  // Gera .next/standalone — só os arquivos e node_modules de fato usados em
  // produção, sem precisar copiar node_modules/ inteiro pra dentro da imagem
  // Docker. Reduz bastante o tamanho da imagem final (ver Dockerfile).
  output: "standalone",
};

module.exports = nextConfig;
