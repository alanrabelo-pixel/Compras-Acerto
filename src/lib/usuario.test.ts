import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { USUARIO_PUBLICO } from "@/lib/usuario";

/**
 * Trava contra o vazamento de colunas sensíveis de User.
 *
 * Um `include` de relação que aponta para User, escrito como
 * `requester: true`, traz TODAS as colunas escalares junto. Foi assim que 24
 * rotas passaram a devolver as chaves de IA pessoais (removidas em
 * 27/08/2026) no JSON sem ninguém decidir isso: o include era escrito para
 * pegar o nome de quem pediu.
 *
 * Este teste é a única coisa que impede a próxima rota de repetir o erro. Ele
 * não roda o sistema: lê o código. Isso tem limite conhecido, registrado no
 * fim do arquivo, mas cobre o padrão que de fato causou o problema.
 */

// Relações que apontam para User. Se alguém criar outra no schema, ela precisa
// entrar aqui, senão o teste não a vigia.
const RELACOES_DE_USUARIO = [
  "requester",
  "buyer",
  "approverManager",
  "contractManager",
  "managers",
  "approver",
  "actor",
  "author",
  "requestedBy",
  "user",
];

// Exceções conscientes. Toda entrada precisa de motivo escrito: a lista existe
// para a exceção ser revisada, não para silenciar o teste.
const EXCECOES: { arquivo: string; motivo: string }[] = [];

function arquivosDeCodigo(dir: string, encontrados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = path.join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      arquivosDeCodigo(caminho, encontrados);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(nome)) continue;
    if (/\.test\.tsx?$/.test(nome)) continue;
    encontrados.push(caminho);
  }
  return encontrados;
}

describe("colunas sensíveis não podem sair numa resposta", () => {
  it("o select público não expõe o googleId", () => {
    const campos = Object.keys(USUARIO_PUBLICO);
    expect(campos).not.toContain("googleId");
  });

  it("nenhum include traz uma relação de usuário sem select", () => {
    const raiz = path.join(process.cwd(), "src");
    const permitidos = new Set(EXCECOES.map((e) => path.join(process.cwd(), e.arquivo)));
    const padrao = new RegExp(`\\b(${RELACOES_DE_USUARIO.join("|")})\\s*:\\s*true\\b`, "g");

    const infracoes: string[] = [];
    for (const arquivo of arquivosDeCodigo(raiz)) {
      if (permitidos.has(arquivo)) continue;
      const linhas = readFileSync(arquivo, "utf8").split("\n");
      linhas.forEach((linha, i) => {
        // Só interessa dentro de uma query do Prisma. Comentário não conta,
        // inclusive a linha de continuação de bloco, que começa com asterisco:
        // este próprio teste e o usuario.ts citam o padrão errado ao explicá-lo.
        const aparado = linha.trim();
        if (aparado.startsWith("*") || aparado.startsWith("//")) return;
        const semComentario = linha.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
        padrao.lastIndex = 0;
        const achado = padrao.exec(semComentario);
        if (!achado) return;
        const relativo = path.relative(process.cwd(), arquivo).replace(/\\/g, "/");
        infracoes.push(`${relativo}:${i + 1}  ${achado[1]}: true`);
      });
    }

    expect(
      infracoes,
      `Relação de usuário incluída sem select. Cada uma destas devolve TODAS ` +
        `as colunas escalares de User no resultado, sensíveis inclusive. Troque ` +
        `por { select: USUARIO_PUBLICO } de @/lib/usuario, ou adicione o arquivo ` +
        `em EXCECOES com o motivo:\n\n${infracoes.join("\n")}\n`
    ).toEqual([]);
  });
});

/**
 * O que este teste NÃO pega, para ninguém confiar demais nele:
 *
 * 1. Query cujo model raiz é User e que devolve o registro inteiro, como
 *    `prisma.user.findMany({ where: ... })` sem select. Detectar isso lendo
 *    texto daria falso positivo em toda leitura interna legítima, que é a
 *    maioria.
 * 2. Include montado em variável, ou espalhado com spread, em vez de escrito
 *    literalmente na chamada.
 * 3. Relação nova apontando para User que ninguém acrescentou na lista acima.
 */
