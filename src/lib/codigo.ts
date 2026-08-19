import { prisma } from "@/lib/db";

/**
 * Geração dos códigos sequenciais (PC-2026-0001, VIA-2026-0001, ...).
 *
 * O que havia antes, nas rotas de criação:
 *
 *   const count = await prisma.purchaseRequest.count();
 *   const code = `PC-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
 *
 * Três defeitos no mesmo par de linhas:
 *
 * 1. CORRIDA. Duas criações simultâneas leem o mesmo `count` e montam o mesmo
 *    código. `code` é @unique, e o create não tinha try/catch, então a segunda
 *    requisição virava erro 500 e o formulário preenchido se perdia.
 * 2. O ANO ERA DECORATIVO. O contador era sobre a tabela inteira, não por ano.
 *    Em 01/01/2027, com 500 solicitações existentes, o primeiro código do ano
 *    seria PC-2027-0501. A sequência nunca reiniciava.
 * 3. COLISÃO PERMANENTE APÓS EXCLUSÃO. Apagada uma linha, o count regride e o
 *    próximo código colide com um já emitido, e continua colidindo.
 *
 * A correção usa a tabela CodeCounter, com a chave embutindo o ano (o que faz a
 * sequência reiniciar sozinha) e o incremento numa única instrução atômica. O
 * INSERT ... ON CONFLICT DO UPDATE resolve num só passo tanto o primeiro uso do
 * ano quanto os seguintes, sem leitura prévia e sem janela entre ler e gravar.
 */
export async function proximoCodigo(prefixo: string, ano = new Date().getFullYear()): Promise<string> {
  const escopo = `${prefixo}-${ano}`;

  // $queryRaw com template tagged: parametrizado pelo Prisma, não é concatenação.
  const linhas = await prisma.$queryRaw<{ value: number }[]>`
    INSERT INTO "CodeCounter" ("prefix", "value")
    VALUES (${escopo}, 1)
    ON CONFLICT ("prefix") DO UPDATE SET "value" = "CodeCounter"."value" + 1
    RETURNING "value"
  `;

  const sequencial = linhas[0]?.value;
  if (!sequencial) {
    throw new Error(`Não foi possível gerar o código sequencial para ${escopo}.`);
  }

  return `${escopo}-${String(sequencial).padStart(4, "0")}`;
}
