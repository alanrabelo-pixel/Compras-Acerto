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

  // SEM DOCKER, CAI PARA O BANCO LOCAL EM VEZ DE TRAVAR.
  //
  // O container é o caminho certo e é o que roda no CI. Mas ele exige Docker,
  // e a máquina de desenvolvimento daqui não tem (instalar exige
  // administrador). Sem esta saída, `npm test` morre no primeiro segundo com
  // "Could not find a working container runtime strategy" e NENHUM teste roda,
  // que é pior que rodar contra o banco local: a suíte tem limpeza própria
  // (src/test-helpers/fixtures.ts, cleanupTestData) e o vitest.config.ts já
  // recusa apontar para qualquer banco que não seja local.
  //
  // O aviso é alto de propósito. Rodar contra o banco de desenvolvimento é
  // aceitável, não é o desejado, e quem vê isso passando na tela precisa
  // saber que está no modo degradado.
  let pararContainer: (() => Promise<void>) | null = null;
  try {
    const container = await new PostgreSqlContainer("postgres:16-alpine").start();
    process.env.DATABASE_URL = container.getConnectionUri();
    pararContainer = async () => {
      await container.stop();
    };
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    console.warn(
      [
        "",
        "  [testes] Docker indisponivel, seguindo com o BANCO LOCAL de desenvolvimento.",
        `  [testes] Motivo: ${motivo}`,
        "  [testes] O isolamento por container nao esta valendo nesta execucao.",
        "  [testes] No CI isto nao acontece: la o servico docker esta declarado no step.",
        "",
      ].join("\n"),
    );
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "Sem Docker e sem DATABASE_URL no .env: nao ha banco nenhum para os testes de integracao.",
      );
    }
  }

  // node:20-alpine (imagem do step "Run Tests" na Golden Pipeline) não traz
  // openssl por padrão — sem ele, o binário nativo do schema-engine do
  // Prisma quebra em runtime ao carregar libssl (fica só o aviso "Prisma
  // failed to detect the libssl/openssl version..." e o db push seguinte
  // falha com uma resposta não-JSON). Fora do Alpine (dev local, outras
  // imagens) isso é um no-op — sem `apk`, o if nem entra.
  // Mesma necessidade do preinstall, e pelo mesmo script: a versão original
  // era um one-liner de shell POSIX, que no Windows o execSync executa pelo
  // cmd.exe e derruba a suíte inteira antes do primeiro teste. Ver
  // scripts/openssl-no-alpine.cjs.
  execSync("node scripts/openssl-no-alpine.cjs", { stdio: "inherit" });

  // Mesma checagem do postinstall (scripts/verify-prisma-engine.cjs),
  // repetida aqui de propósito: o "Run Tests" e o "Install Dependencies"
  // são containers separados na Golden Pipeline, e o cache de
  // node_modules restaurado num pode não refletir o que o outro acabou
  // de gerar (visto na prática: o postinstall confirmou o engine OK, mas
  // o "Run Tests" mesmo assim recebeu um node_modules sem o
  // linux-musl-openssl-3.0.x). Rodar de novo aqui garante o engine certo
  // independente de qual node_modules foi restaurado neste step.
  execSync("node scripts/verify-prisma-engine.cjs", { stdio: "inherit" });

  // `db push` (não `migrate deploy`): banco efêmero e descartável não precisa
  // de histórico de migration, só do schema atual aplicado direto. É a
  // abordagem recomendada pela própria documentação do Prisma para bancos de
  // teste.
  //
  // SÓ NO CONTAINER. No caminho degradado, o alvo é o banco de
  // desenvolvimento, e `--accept-data-loss` ali significa deixar o Prisma
  // reformar um banco com dado dentro para casar com o schema, apagando
  // coluna e tabela sem perguntar. O banco local já está migrado pelo fluxo
  // normal; se estiver desatualizado, os testes falham dizendo qual coluna
  // falta, que é infinitamente melhor que um push silencioso.
  if (pararContainer) {
    execSync("npx prisma db push --skip-generate --accept-data-loss", {
      stdio: "inherit",
      env: process.env,
    });
  }

  return async () => {
    if (pararContainer) await pararContainer();
  };
}
