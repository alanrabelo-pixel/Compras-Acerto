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
  const container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const databaseUrl = container.getConnectionUri();

  // Sobrescreve de propósito o que vitest.config.ts já carregou do .env —
  // os testes de integração precisam do banco efêmero, não do banco de
  // desenvolvimento local (que pode ter dados reais).
  process.env.DATABASE_URL = databaseUrl;

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
