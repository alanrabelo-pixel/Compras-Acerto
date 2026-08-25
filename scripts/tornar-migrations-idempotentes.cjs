/**
 * Reescreve migrations para poderem ser aplicadas mais de uma vez sem erro.
 *
 * POR QUE ISTO EXISTE. A Golden Pipeline aplica migration lendo os arquivos de
 * sql/acerto-compras/ que MUDARAM naquele commit:
 *
 *   git diff --name-only --diff-filter=ACMRT "$COMMIT^1" "$COMMIT" -- sql/acerto-compras
 *
 * Isso significa que um arquivo tocado de novo, por qualquer motivo, e reenviado
 * ao banco. E motivo nao falta: o proprio scripts/sync-migration-sql.ts
 * SOBRESCREVE o espelho sempre que o conteudo diverge da migration do Prisma,
 * entao uma edicao manual num dos lados volta como alteracao no commit seguinte.
 * Com DDL nao idempotente, essa reaplicacao falha em CREATE TABLE, e o passo de
 * migration inteiro aborta.
 *
 * Idempotencia tambem cobre o caso mais provavel de todos: o passo falhar no
 * meio, alguem corrigir e mandar rodar de novo.
 *
 * O que transforma, e por que cada um e seguro:
 *
 *   CREATE TABLE "X"            -> CREATE TABLE IF NOT EXISTS "X"
 *   CREATE INDEX "X"            -> CREATE INDEX IF NOT EXISTS "X"
 *   CREATE UNIQUE INDEX "X"     -> CREATE UNIQUE INDEX IF NOT EXISTS "X"
 *   ADD COLUMN "X"              -> ADD COLUMN IF NOT EXISTS "X"
 *   ALTER TYPE .. ADD VALUE 'x' -> ADD VALUE IF NOT EXISTS 'x'
 *   ADD CONSTRAINT "X"          -> precedido de DROP CONSTRAINT IF EXISTS "X"
 *
 * Nao mexe em CREATE TYPE nem em INSERT: exigem DO block e ON CONFLICT, que sao
 * decisoes caso a caso e ficam a cargo de quem escreve a migration. O relatorio
 * no fim lista o que ficou de fora, para conferencia manual.
 *
 * Uso: node scripts/tornar-migrations-idempotentes.cjs <arquivo> [<arquivo>...]
 */
const fs = require("node:fs");

/** Cada regra devolve o texto transformado. Nenhuma usa template literal. */
const REGRAS = [
  {
    nome: "CREATE TABLE",
    de: /\bCREATE TABLE (?!IF NOT EXISTS)"/gi,
    para: 'CREATE TABLE IF NOT EXISTS "',
  },
  {
    nome: "CREATE UNIQUE INDEX",
    de: /\bCREATE UNIQUE INDEX (?!IF NOT EXISTS)"/gi,
    para: 'CREATE UNIQUE INDEX IF NOT EXISTS "',
  },
  {
    nome: "CREATE INDEX",
    de: /\bCREATE INDEX (?!IF NOT EXISTS)"/gi,
    para: 'CREATE INDEX IF NOT EXISTS "',
  },
  {
    nome: "ADD COLUMN",
    de: /\bADD COLUMN\s+(?!IF NOT EXISTS)"/gi,
    para: 'ADD COLUMN IF NOT EXISTS "',
  },
  {
    nome: "ADD VALUE",
    de: /\bADD VALUE (?!IF NOT EXISTS)'/gi,
    para: "ADD VALUE IF NOT EXISTS '",
  },
];

/**
 * ADD CONSTRAINT precisa de tratamento proprio: nao existe IF NOT EXISTS para
 * constraint no Postgres. A saida e derrubar antes de criar, o que tambem
 * corrige o caso de uma constraint com o mesmo nome e definicao diferente.
 * A instrucao de DROP entra na MESMA instrucao ALTER TABLE, separada por
 * virgula, para nao mudar a contagem de comandos nem depender de transacao.
 */
function adicionarDropDeConstraint(texto) {
  let quantas = 0;
  const novo = texto.replace(
    /ALTER TABLE\s+("[^"]+")\s*\n?\s*ADD CONSTRAINT\s+("[^"]+")/gi,
    function (inteiro, tabela, constraint) {
      if (/DROP CONSTRAINT/i.test(inteiro)) return inteiro;
      quantas++;
      return (
        "ALTER TABLE " + tabela + "\n  DROP CONSTRAINT IF EXISTS " + constraint +
        ";\nALTER TABLE " + tabela + "\n  ADD CONSTRAINT " + constraint
      );
    },
  );
  return { texto: novo, quantas: quantas };
}

const arquivos = process.argv.slice(2);
if (arquivos.length === 0) {
  console.error("Informe pelo menos um arquivo .sql.");
  process.exit(1);
}

let totalAlterado = 0;
const pendentes = [];

for (const caminho of arquivos) {
  if (!fs.existsSync(caminho)) {
    console.log("AUSENTE: " + caminho);
    continue;
  }
  const antes = fs.readFileSync(caminho, "utf8");
  let depois = antes;
  const aplicadas = [];

  for (const regra of REGRAS) {
    const contagem = (depois.match(regra.de) || []).length;
    if (contagem > 0) {
      depois = depois.replace(regra.de, regra.para);
      aplicadas.push(regra.nome + " x" + contagem);
    }
  }

  const comDrop = adicionarDropDeConstraint(depois);
  depois = comDrop.texto;
  if (comDrop.quantas > 0) aplicadas.push("ADD CONSTRAINT x" + comDrop.quantas);

  // O que este script NAO sabe tornar idempotente, para conferencia manual.
  if (/\bCREATE TYPE\b/i.test(depois)) pendentes.push(caminho + " -> CREATE TYPE");
  if (/\bINSERT INTO\b/i.test(depois) && !/ON CONFLICT/i.test(depois)) {
    pendentes.push(caminho + " -> INSERT sem ON CONFLICT");
  }

  if (depois === antes) {
    console.log("sem mudanca: " + caminho);
    continue;
  }
  fs.writeFileSync(caminho, depois, "utf8");
  totalAlterado++;
  console.log("REESCRITO: " + caminho + "  [" + aplicadas.join(", ") + "]");
}

console.log("\n" + totalAlterado + " de " + arquivos.length + " arquivo(s) alterado(s).");
if (pendentes.length > 0) {
  console.log("\nPRECISAM DE AJUSTE MANUAL (o script nao mexe nestes):");
  for (const p of pendentes) console.log("  " + p);
}
