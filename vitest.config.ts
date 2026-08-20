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
exigirBancoLocal("A suíte de testes (vitest)");

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
    // O padrão do Vitest é 5s, curto demais aqui. Estes são testes de
    // integração de verdade: batem no Postgres, e os arquivos rodam em
    // paralelo disputando o mesmo banco de desenvolvimento. Num arranque frio
    // (logo após prisma generate, por exemplo) o tempo de import passou de 50s
    // para 118s e uma corrida inteira falhou por timeout, sem nada de errado no
    // comportamento testado. Falha por timeout aqui é ruído que esconde
    // regressão de verdade, que é o que a suíte precisa apontar.
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
