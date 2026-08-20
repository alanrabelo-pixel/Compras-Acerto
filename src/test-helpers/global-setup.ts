/**
 * Setup global do vitest — sobe um Postgres real e descartável via
 * Testcontainers pros testes de integração (rotas de API que usam o
 * Prisma real, ver src/test-helpers/fixtures.ts).
 *
 * Mesma técnica já usada pelos apps .NET da Acerto na Golden Pipeline
 * (dotnet.js: `services: ['docker']` no step de teste, Bitbucket seta
 * DOCKER_HOST automaticamente) — nodejs.js foi estendido pra declarar o
 * mesmo serviço, então isso funciona sem configuração extra tanto local
 * (com Docker Desktop rodando) quanto no CI.
 *
 * Roda uma vez antes de toda a suíte (globalSetup do vitest), não por
 * arquivo de teste — o container é compartilhado entre todos os testes e
 * derrubado só no fim.
 */
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { execSync } from "node:child_process";

export default async function setup() {
  // Fallbacks pra CI (que não tem .env real, só a máquina local tem — ver
  // vitest.config.ts): sem eles, requireRole() (src/lib/rbac.ts) cai no
  // fluxo de sessão real e chama getServerSession -> next/headers fora de
  // um request scope (rotas chamadas direto no teste, sem servidor Next
  // de verdade), e encryptSecret()/decryptSecret() (src/lib/crypto.ts)
  // lançam por falta de chave. Não sobrescreve se já vier do .env local.
  process.env.LOCAL_BYPASS_AUTH ??= "true";
  process.env.AI_KEY_ENCRYPTION_SECRET ??= "test-only-secret-nao-usar-em-producao";

  const container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const databaseUrl = container.getConnectionUri();

  // Sobrescreve de propósito o que vitest.config.ts já carregou do .env —
  // os testes de integração precisam do banco efêmero, não do banco de
  // desenvolvimento local (que pode ter dados reais).
  process.env.DATABASE_URL = databaseUrl;

  // node:20-alpine (imagem do step "Run Tests" na Golden Pipeline) não traz
  // openssl por padrão — sem ele, o binário nativo do schema-engine do
  // Prisma quebra em runtime ao carregar libssl (fica só o aviso "Prisma
  // failed to detect the libssl/openssl version..." e o db push seguinte
  // falha com uma resposta não-JSON). Fora do Alpine (dev local, outras
  // imagens) isso é um no-op — sem `apk`, o if nem entra.
  execSync(
    "if command -v apk >/dev/null 2>&1; then apk add --no-cache openssl >/dev/null 2>&1 || true; fi",
    { stdio: "inherit" },
  );

  // Mesma checagem do postinstall (scripts/verify-prisma-engine.cjs),
  // repetida aqui de propósito: o "Run Tests" e o "Install Dependencies"
  // são containers separados na Golden Pipeline, e o cache de
  // node_modules restaurado num pode não refletir o que o outro acabou
  // de gerar (visto na prática: o postinstall confirmou o engine OK, mas
  // o "Run Tests" mesmo assim recebeu um node_modules sem o
  // linux-musl-openssl-3.0.x). Rodar de novo aqui garante o engine certo
  // independente de qual node_modules foi restaurado neste step.
  execSync("node scripts/verify-prisma-engine.cjs", { stdio: "inherit" });

  // `db push` (não `migrate deploy`): banco efêmero e descartável não
  // precisa de histórico de migration, só do schema atual aplicado direto —
  // é a abordagem recomendada pela própria documentação do Prisma pra
  // bancos de teste.
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    stdio: "inherit",
    env: process.env,
  });

  return async () => {
    await container.stop();
  };
}
