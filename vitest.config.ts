import { defineConfig } from "vitest/config";
import path from "path";
import fs from "fs";
import { exigirBancoLocal } from "./src/lib/guarda-banco";

// Carrega .env manualmente (sem dep extra) para os testes de integração das
// rotas de API, já que elas importam @/lib/db (Prisma real) no topo, e
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

// Depois de carregar o .env (é ele quem costuma trazer o DATABASE_URL) e antes
// de qualquer teste subir. A suíte é de integração de verdade: cria registros
// no Postgres e, no cleanup, roda deleteMany por prefixo
// (src/test-helpers/fixtures.ts). Apontada para Produção ou Sandbox, ela grava
// e apaga lá, sem desfazer. Lançar aqui aborta a corrida inteira ainda na
// leitura da configuração. Ver src/lib/guarda-banco.ts.
//
// SÓ QUANDO JÁ EXISTE UM DATABASE_URL PARA JULGAR. Ausência não é o perigo que
// esta guarda existe para pegar: o perigo é uma URL apontando para longe. E no
// CI a variável está ausente por construção, porque não há .env e quem fornece
// o banco é o Testcontainers, que só sobe no globalSetup, depois deste arquivo
// ser lido. Abortar aqui derrubava o passo "Run Tests" da Golden Pipeline antes
// do primeiro teste, com uma mensagem sobre banco de produção que não tinha
// nada a ver com o que estava acontecendo. Visto em 25/08/2026, na pipeline #33.
//
// A cobertura não diminui: o mesmo exigirBancoLocal roda de novo no
// src/test-helpers/global-setup.ts, depois de o DATABASE_URL estar definido,
// venha ele do container ou do .env da máquina. O caso perigoso, .env local
// apontando para produção, continua barrado aqui, antes de qualquer teste.
if (process.env.DATABASE_URL) {
  exigirBancoLocal("A suíte de testes (vitest)");
}

export default defineConfig({
  // O tsconfig do app usa jsx:"preserve" (o build do Next.js faz essa parte via
  // SWC), mas o transformador do Vitest (oxc, nesta versão do Vite) não sabe
  // compilar "preserve", só "automatic"/"transform". Sem este override,
  // qualquer .tsx importado por um teste (ex: a rota de Pedido de Compra, que
  // gera PDF via JSX) falha ao transformar.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    environment: "node",

    // BANCO EFÊMERO VIA TESTCONTAINERS, trazido do time de engenharia em
    // 25/08/2026. Sobe um Postgres real e descartável antes da suíte e derruba
    // no fim, sobrescrevendo o DATABASE_URL só durante os testes (ver
    // src/test-helpers/global-setup.ts). Requer Docker disponível.
    //
    // Resolve de raiz um problema que este arquivo documentava como conhecido:
    // a suíte rodava contra o banco de DESENVOLVIMENTO, com prefixo aleatório
    // por arquivo fazendo as vezes de isolamento. Em 21/08/2026 isso já tinha
    // deixado 1172 linhas de lixo lá (439 usuários de teste para 22 reais), e
    // a disputa pelo mesmo banco fazia a suíte falhar de forma intermitente
    // sem nenhuma regressão de comportamento.
    globalSetup: "./src/test-helpers/global-setup.ts",

    // Testcontainers sobe e derruba um container real: mais lento que um mock,
    // mas uma vez só para a suíte inteira, não por arquivo.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
