import { defineConfig } from "vitest/config";
import path from "path";
import fs from "fs";

// Carrega .env manualmente (sem dep extra) para os testes de integração das
// rotas de API — elas importam @/lib/db (Prisma real) no topo do arquivo, e
// precisam de DATABASE_URL/LOCAL_BYPASS_AUTH disponíveis antes de rodar.
const envPath = path.resolve(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match) continue;
    const key = match[1];
    let value = (match[2] ?? "").trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

export default defineConfig({
  // O tsconfig do app usa jsx:"preserve" (o build do Next.js faz essa parte via
  // SWC) — mas o transformador do Vitest (oxc, nesta versão do Vite) não sabe
  // compilar "preserve", só "automatic"/"transform". Sem este override,
  // qualquer .tsx importado por um teste (ex: a rota de Pedido de Compra, que
  // gera PDF via JSX) falha ao transformar.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    environment: "node",
    // Sobe um Postgres real e descartável via Testcontainers antes da suíte
    // (ver src/test-helpers/global-setup.ts) e derruba no final — sobrescreve
    // o DATABASE_URL carregado do .env acima só pra duração dos testes.
    // Requer Docker disponível (Docker Desktop local, ou o serviço `docker`
    // declarado no step "Run Tests" da Golden Pipeline em CI).
    globalSetup: "./src/test-helpers/global-setup.ts",
    // Testcontainers sobe/derruba um container real — mais lento que um
    // mock, mas roda uma vez só pra suíte inteira (não por arquivo).
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
