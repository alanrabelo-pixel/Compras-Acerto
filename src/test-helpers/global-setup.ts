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
import { exigirBancoLocal } from "@/lib/guarda-banco";

export default async function setup() {
  // Fallback pra CI (que não tem .env real, só a máquina local tem — ver
  // vitest.config.ts): sem ele, requireRole() (src/lib/rbac.ts) cai no
  // fluxo de sessão real e chama getServerSession -> next/headers fora de
  // um request scope (rotas chamadas direto no teste, sem servidor Next
  // de verdade). Não sobrescreve se já vier do .env local.
  process.env.LOCAL_BYPASS_AUTH ??= "true";

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

  // A GUARDA DE BANCO, AGORA QUE HÁ UM DATABASE_URL PARA JULGAR.
  //
  // O vitest.config.ts só consegue conferir o que veio do .env, e no CI não há
  // .env: quem define o banco é o container acima. Este é o primeiro ponto em
  // que a URL final existe nos dois caminhos, o do container e o degradado, e
  // por isso é aqui que a conferência fecha. Sem ela, o caminho degradado
  // poderia rodar contra qualquer banco que estivesse no ambiente.
  //
  // O container do Testcontainers atende em localhost numa porta aleatória,
  // então passa. Ver src/lib/guarda-banco.ts.
  exigirBancoLocal("A suíte de testes (vitest, apos resolver o banco)");

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

  // `migrate deploy`, E NÃO `db push`. Era push aqui, escolha do time de
  // engenharia com a justificativa razoável de que banco efêmero não precisa de
  // histórico. O problema é que push não reproduz a produção, e a diferença não
  // é acadêmica: ele monta o banco a partir do prisma/schema.prisma, que não
  // sabe expressar duas coisas que só existem nas migrations.
  //
  // Custou 18 testes vermelhos na pipeline de 25/08/2026:
  //
  //   - as 11 constraints CHECK de 20260819210000_constraints_de_coerencia não
  //     existiam, então o banco aceitava status inválido e decisão de gestor
  //     sem data, e src/lib/constraints.test.ts falhava justamente por o banco
  //     NÃO recusar o que deveria;
  //   - a escada de alçada de 20260821110411_alcadas_editaveis nasce dentro de
  //     uma migration, então ApprovalTier ficava vazia e faixaDoValor()
  //     devolvia null, derrubando 15 testes de aprovação.
  //
  // Nada disso aparecia enquanto a suíte rodava contra o banco de
  // desenvolvimento, que recebeu tudo pelo fluxo normal. O Postgres limpo do
  // Testcontainers expôs a diferença, que é exatamente para isso que ele serve.
  //
  // `migrate deploy` é o mesmo caminho que leva o schema a produção, então o
  // banco de teste passa a ser o banco de verdade. As migrations posteriores a
  // 18/08 são idempotentes (ver scripts/tornar-migrations-idempotentes.cjs), e
  // num banco novo o histórico nasce limpo, sem conflito de checksum.
  //
  // SÓ NO CONTAINER. No caminho degradado o alvo é o banco de desenvolvimento,
  // já migrado pelo fluxo normal; se estiver desatualizado, os testes falham
  // dizendo qual coluna falta, que é melhor que mexer nele por conta própria.
  if (pararContainer) {
    execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
  }

  // SEMENTE DAS FAIXAS DE ALÇADA.
  //
  // `db push` cria o schema a partir do prisma/schema.prisma e NÃO roda
  // migration nenhuma. A escada padrão de aprovação nasce dentro de uma
  // migration (20260821110411_alcadas_editaveis), então num banco criado por
  // push a tabela ApprovalTier existe e está VAZIA.
  //
  // Isso passava despercebido enquanto os testes rodavam contra o banco de
  // desenvolvimento, que recebeu a semente pelo fluxo normal de migration. O
  // Postgres efêmero do Testcontainers, trazido do time de engenharia, é limpo
  // de verdade, e em 25/08/2026 derrubou 15 testes de aprovação de uma vez:
  // faixaDoValor() devolve null com a tabela vazia (src/lib/alcadas.ts), e a
  // rota de aprovação não tem alçada para rotear. Um banco limpo revelando uma
  // dependência escondida é exatamente para isso que ele serve.
  //
  // Os valores são os mesmos da migration de propósito: o teste tem que
  // exercitar a escada que produção realmente usa, não uma inventada aqui.
  //
  // skipDuplicates deixa isto seguro no caminho degradado, onde o banco local
  // já tem as faixas, e também se alguém rodar o setup duas vezes.
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  try {
    await prisma.approvalTier.createMany({
      data: [
        { level: 1, label: "Nivel 1 (ate R$ 50 mil)", maxValue: 50000, requiredApprovers: 1, active: true },
        { level: 2, label: "Nivel 2 (ate R$ 500 mil)", maxValue: 500000, requiredApprovers: 2, active: true },
        { level: 3, label: "Nivel 3 (acima de R$ 500 mil)", maxValue: null, requiredApprovers: 2, active: true },
      ],
      skipDuplicates: true,
    });
  } finally {
    await prisma.$disconnect();
  }

  return async () => {
    if (pararContainer) await pararContainer();
  };
}
