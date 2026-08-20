/**
 * Embrulho dos comandos do Prisma que ESCREVEM no banco.
 *
 * Por que existe: a guarda de src/lib/guarda-banco.ts cobria duas rotinas de
 * escrita (o seed e a suíte de testes) e o repositório tem cinco. As outras
 * três são `prisma migrate dev`, `prisma db push` e `prisma migrate reset`, e a
 * quarta, `prisma studio`, abre uma interface que edita linha a linha. Nenhuma
 * delas passa por código nosso: `prisma` é um binário de terceiro que lê o
 * DATABASE_URL sozinho e vai direto no banco. Não há onde encaixar a guarda por
 * dentro, então ela entra por fora: os scripts de npm apontam para cá, este
 * arquivo chama a guarda e só então delega ao Prisma, com os mesmos argumentos.
 *
 * O buraco que isso fecha é concreto. Com a string de conexão de Produção no
 * `.env` (que é o estado normal de quem acabou de depurar algo em produção), um
 * `npm run prisma:migrate` distraído aplica migração de schema no banco de
 * verdade, e um `prisma migrate reset` apaga tudo e roda o seed por cima. O
 * `npm test` já estava protegido; o comando ao lado dele, não.
 *
 * FICA DE FORA, e é a única exceção: `prisma migrate deploy`. É o comando que a
 * Vercel roda contra o banco remoto de produção a cada deploy, o único caso em
 * que escrever fora do localhost é o certo. Tem script próprio
 * (`npm run prisma:deploy`), sem embrulho. Este arquivo recusa o subcomando de
 * propósito, para o caso de alguém apontar o script de deploy para cá: melhor
 * recusar aqui, explicando, do que quebrar o deploy de produção com uma
 * mensagem sobre "banco não local" no pior momento possível.
 *
 * O que este embrulho NÃO faz: impedir alguém de digitar `npx prisma db push`
 * direto no terminal. Não existe como. Ele torna o caminho guardado o caminho
 * curto, que é o que dá para fazer.
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { exigirBancoLocal } from "../src/lib/guarda-banco";

const RAIZ = path.resolve(__dirname, "..");

/**
 * Carrega o `.env` para process.env sem sobrescrever o que já veio do shell,
 * que é a mesma precedência do Prisma e a mesma do vitest.config.ts.
 *
 * Precisa existir aqui: quem carrega o `.env` normalmente é o próprio Prisma,
 * já dentro do processo dele, e nesse momento a guarda já teria deixado passar.
 * Sem esta função a guarda barraria todo mundo por "DATABASE_URL ausente",
 * inclusive quem está com o banco local certo, e a primeira reação a uma
 * barreira que erra é desligar a barreira.
 */
function carregarEnv(caminho: string): void {
  if (!fs.existsSync(caminho)) return;

  for (const linha of fs.readFileSync(caminho, "utf-8").split("\n")) {
    const casamento = linha.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!casamento) continue;

    const chave = casamento[1];
    let valor = (casamento[2] ?? "").trim();
    if (valor.startsWith('"') && valor.endsWith('"')) valor = valor.slice(1, -1);
    if (!process.env[chave]) process.env[chave] = valor;
  }
}

function abortar(mensagem: string): never {
  console.error(mensagem);
  process.exit(1);
}

/**
 * Caminho do CLI do Prisma, lido do manifesto do pacote em vez de chutado.
 *
 * Invocar `node node_modules/prisma/build/index.js` em vez de `prisma` evita
 * depender do PATH e evita `shell: true`, que no Windows quebraria qualquer
 * argumento com espaço (um `--name "ajuste no contrato"` viraria dois).
 */
function caminhoDoPrisma(): string {
  const pasta = path.resolve(RAIZ, "node_modules/prisma");
  const manifesto = path.join(pasta, "package.json");

  if (!fs.existsSync(manifesto)) {
    abortar(
      "[guarda de banco] não encontrei node_modules/prisma. Rode `npm install` antes.\n" +
        `Procurei em: ${manifesto}`
    );
  }

  const bin = JSON.parse(fs.readFileSync(manifesto, "utf-8")).bin;
  const relativo = typeof bin === "string" ? bin : bin?.prisma;

  if (typeof relativo !== "string") {
    abortar(
      "[guarda de banco] o package.json do Prisma não declara o binário esperado. " +
        "Sem isso não dá para delegar o comando, e delegar de qualquer jeito seria " +
        "adivinhar caminho de dependência."
    );
  }

  return path.resolve(pasta, relativo);
}

const argumentos = process.argv.slice(2);

if (argumentos.length === 0) {
  abortar(
    "[guarda de banco] uso: tsx scripts/prisma-guardado.ts <subcomando do prisma> [opções]\n" +
      "Este embrulho existe para os comandos do Prisma que escrevem no banco. " +
      "Ver os scripts prisma:migrate, prisma:push, prisma:reset e prisma:studio no package.json."
  );
}

if (argumentos[0] === "migrate" && argumentos[1] === "deploy") {
  abortar(
    "[guarda de banco] `migrate deploy` não passa por este embrulho, e isso é intencional.\n" +
      "É o comando que a Vercel roda contra o banco remoto de PRODUÇÃO: guardá-lo por " +
      "host local faria o deploy falhar exatamente quando precisa funcionar.\n" +
      "Use `npm run prisma:deploy`, que chama o Prisma direto."
  );
}

carregarEnv(path.resolve(RAIZ, ".env"));

// Antes de qualquer delegação. Daqui para baixo quem manda no banco é o Prisma,
// e não há segundo ponto de conferência. A mensagem de bloqueio traz o comando
// inteiro porque é a informação que falta na hora: quase sempre a pessoa nem
// lembra que aquele script toca no banco.
try {
  exigirBancoLocal(`O comando \`prisma ${argumentos.join(" ")}\``);
} catch (erro) {
  // Só a mensagem, sem pilha: a pilha empurraria para fora da tela justamente o
  // texto que explica o que fazer.
  abortar(erro instanceof Error ? erro.message : String(erro));
}

const execucao = spawnSync(process.execPath, [caminhoDoPrisma(), ...argumentos], {
  stdio: "inherit",
  cwd: RAIZ,
});

if (execucao.error) {
  abortar(`[guarda de banco] não consegui executar o Prisma: ${execucao.error.message}`);
}

// `status` é null quando o processo morreu por sinal (um Ctrl+C no meio de uma
// migração, por exemplo). Sair com 1 nesse caso mantém `npm run` falhando, que
// é o correto: nada garante que a migração terminou.
process.exit(execucao.status ?? 1);
