/**
 * Roda docs/conferencia-pre-deploy.sql contra um banco e imprime os números.
 *
 * SÓ LÊ. Antes de mandar qualquer comando para o banco, confere que ele começa
 * com SELECT e recusa o resto. A trava é proposital e não é sobre desconfiar do
 * arquivo: é para que apontar isto para a PRODUÇÃO seja uma operação sem
 * consequência possível, mesmo que alguém edite o .sql depois.
 *
 * A URL do banco NUNCA é impressa. Vem de uma variável de ambiente ou de um
 * arquivo passado por caminho, e o que aparece na tela é só o host, sem
 * usuário e sem senha. O motivo é concreto: em 25/08/2026 uma credencial foi
 * parar num log por um comando que a imprimiu sem necessidade.
 *
 * Uso:
 *   DATABASE_URL_ALVO="postgres://..." node scripts/conferencia-pre-deploy.mjs
 *   node scripts/conferencia-pre-deploy.mjs --arquivo caminho/para/url.txt
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

function urlDoAlvo() {
  const i = process.argv.indexOf("--arquivo");
  if (i !== -1 && process.argv[i + 1]) {
    return readFileSync(process.argv[i + 1], "utf8").trim();
  }
  const daEnv = process.env.DATABASE_URL_ALVO;
  if (daEnv) return daEnv.trim();
  throw new Error(
    "Informe o banco: DATABASE_URL_ALVO no ambiente, ou --arquivo <caminho>.\n" +
      "Não passe a URL como argumento direto: argumento de linha de comando fica no histórico do shell.",
  );
}

/** Só o host, para a pessoa confirmar que apontou para onde queria. */
function hostVisivel(url) {
  try {
    return new URL(url).host;
  } catch {
    return "(não consegui interpretar a URL)";
  }
}

function comandosDoArquivo(caminho) {
  return readFileSync(caminho, "utf8")
    .split("\n")
    .filter((linha) => !linha.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean);
}

const url = urlDoAlvo();
console.log(`Banco alvo: ${hostVisivel(url)}\n`);

const prisma = new PrismaClient({ datasources: { db: { url } } });
const comandos = comandosDoArquivo("docs/conferencia-pre-deploy.sql");

let falhas = 0;
for (const [i, comando] of comandos.entries()) {
  if (!/^select\b/i.test(comando)) {
    console.log(`consulta ${i + 1}: RECUSADA, não é SELECT. Nada foi enviado ao banco.`);
    falhas++;
    continue;
  }
  try {
    const linhas = await prisma.$queryRawUnsafe(comando);
    const legivel = JSON.stringify(linhas, (_, v) => (typeof v === "bigint" ? Number(v) : v), 2);
    console.log(`consulta ${i + 1}: ${linhas.length} linha(s)\n${legivel}\n`);
  } catch (erro) {
    console.log(`consulta ${i + 1}: FALHOU -> ${erro.message}\n`);
    falhas++;
  }
}

await prisma.$disconnect();
console.log(falhas === 0 ? "Todas as consultas rodaram." : `${falhas} consulta(s) com problema.`);
process.exit(falhas === 0 ? 0 : 1);
