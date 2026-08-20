import { describe, it, expect, afterEach, vi } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { bancoEhLocal, mensagemDeBloqueio, avaliarBancoDeDados } from "./guarda-banco";
import { validarAmbiente } from "./env";

/**
 * Três buracos da guarda de banco, apontados por um agente adversarial sobre o
 * commit que a criou:
 *
 * 1. Ela cobria 2 das 5 rotinas que escrevem. `prisma migrate dev`, `db push`,
 *    `migrate reset` e `studio` passavam ao largo, porque são binário de
 *    terceiro e não código nosso.
 * 2. Existiam duas definições de "banco local" que discordavam entre si, e uma
 *    URL sem credenciais caía no meio da discordância.
 * 3. A guarda confere host, não identidade de banco, e um túnel local a
 *    contorna. Isso não dava para consertar, então tinha que estar escrito.
 *
 * Os testes de fonte deste arquivo existem porque o que está sendo verificado é
 * ligação, não comportamento de função: uma guarda perfeita que ninguém chama
 * protege exatamente nada, e esse é o modo de falha que passa despercebido.
 */

const RAIZ = process.cwd();
const CAMINHO_ENV = path.resolve(RAIZ, "src/lib/env.ts");
const CAMINHO_GUARDA = path.resolve(RAIZ, "src/lib/guarda-banco.ts");
const CAMINHO_EMBRULHO = path.resolve(RAIZ, "scripts/prisma-guardado.ts");
const CAMINHO_PACKAGE = path.resolve(RAIZ, "package.json");

function lerFonte(caminho: string): string {
  expect(fs.existsSync(caminho), `arquivo esperado não encontrado: ${caminho}`).toBe(true);
  return fs.readFileSync(caminho, "utf-8");
}

function scriptsDoPackage(): Record<string, string> {
  return JSON.parse(lerFonte(CAMINHO_PACKAGE)).scripts;
}

describe("definição única de banco local", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reconhece localhost sem credenciais, o caso em que as duas definições discordavam", () => {
    // A regex antiga de env.ts era /@(localhost|127\.0\.0\.1)[:/]/ e exigia
    // arroba, ou seja, exigia usuário e senha na string. Um Postgres local com
    // `trust` não precisa de nenhum dos dois.
    expect(bancoEhLocal("postgresql://localhost:5433/acerto")).toBe(true);
    expect(bancoEhLocal("postgresql://127.0.0.1:5433/acerto")).toBe(true);
  });

  it("env.ts não tem mais definição própria: importa a da guarda", () => {
    const fonte = lerFonte(CAMINHO_ENV);

    expect(fonte).toMatch(/import \{ bancoEhLocal \} from "@\/lib\/guarda-banco";/);
    expect(fonte, "env.ts voltou a definir seu próprio bancoEhLocal").not.toMatch(/function\s+bancoEhLocal/);
  });

  it("as duas barreiras dão o mesmo veredito para a mesma URL", () => {
    // validarAmbiente só recusa "produção apontando para banco local" quando
    // considera a URL local, então o texto do erro serve de sonda para saber o
    // que ela concluiu. Enquanto as respostas baterem, não há fresta entre as
    // duas barreiras.
    const CASOS = [
      "postgresql://localhost:5433/acerto",
      "postgresql://postgres:senha@localhost:5433/acerto",
      "postgresql://127.0.0.1:5433/acerto",
      "postgres://LOCALHOST:5433/acerto",
      "postgresql://u:p@db.provedor.com:5432/acerto",
      "postgresql://u:senha@localhost@db-de-producao.exemplo.net:5432/acerto",
    ];

    for (const url of CASOS) {
      vi.stubEnv("APP_ENV", "producao");
      vi.stubEnv("DATABASE_URL", url);

      let envDisseLocal = false;
      try {
        validarAmbiente();
      } catch (erro) {
        envDisseLocal = /banco local/i.test((erro as Error).message);
      }

      expect(envDisseLocal, `discordância em ${url}`).toBe(bancoEhLocal(url));
    }
  });

  it("o Postgres local sem senha deixou de ser tratado como banco remoto sem marca de Sandbox", () => {
    // Consequência prática da unificação: antes esta combinação derrubava o
    // boot do desenvolvimento, porque env.ts a lia como remota.
    vi.stubEnv("APP_ENV", "sandbox");
    vi.stubEnv("DATABASE_URL", "postgresql://localhost:5433/acerto");

    expect(() => validarAmbiente()).not.toThrow();
  });
});

describe("cobertura: os comandos do Prisma que escrevem passam pela guarda", () => {
  const EMBRULHO = "tsx scripts/prisma-guardado.ts";

  it("prisma:migrate, prisma:push, prisma:reset e prisma:studio delegam pelo embrulho", () => {
    const scripts = scriptsDoPackage();

    expect(scripts["prisma:migrate"]).toBe(`${EMBRULHO} migrate dev`);
    expect(scripts["prisma:push"]).toBe(`${EMBRULHO} db push`);
    expect(scripts["prisma:reset"]).toBe(`${EMBRULHO} migrate reset`);
    expect(scripts["prisma:studio"]).toBe(`${EMBRULHO} studio`);
  });

  it("nenhum script chama direto um comando do Prisma que escreve", () => {
    // O teste acima passaria se alguém acrescentasse um segundo script com o
    // comando cru ao lado. Este pega isso.
    const CRUS = /(^|[\s&|])(npx\s+)?prisma\s+(migrate\s+dev|db\s+push|migrate\s+reset|studio)\b/;

    for (const [nome, comando] of Object.entries(scriptsDoPackage())) {
      expect(comando, `o script "${nome}" chama o Prisma direto, sem guarda`).not.toMatch(CRUS);
    }
  });

  it("migrate deploy fica fora da guarda, porque é o comando da Vercel contra o banco de produção", () => {
    const scripts = scriptsDoPackage();

    expect(scripts["prisma:deploy"]).toBe("prisma migrate deploy");
    expect(scripts["prisma:deploy"]).not.toContain("prisma-guardado");
  });

  it("o seed e a suíte continuam ligados, que era a cobertura que já existia", () => {
    expect(scriptsDoPackage()["prisma:seed"]).toBe("tsx prisma/seed.ts");
    expect(lerFonte(path.resolve(RAIZ, "prisma/seed.ts"))).toContain("exigirBancoLocal(");
    expect(lerFonte(path.resolve(RAIZ, "vitest.config.ts"))).toContain("exigirBancoLocal(");
  });
});

describe("o embrulho: ordem das operações", () => {
  it("carrega o .env, depois chama a guarda, depois delega ao Prisma", () => {
    const fonte = lerFonte(CAMINHO_EMBRULHO);
    const carga = fonte.indexOf("carregarEnv(path.resolve");
    const guarda = fonte.indexOf("exigirBancoLocal(");
    const delegacao = fonte.indexOf("spawnSync(process.execPath");

    // A carga vem antes porque o DATABASE_URL costuma morar só no .env: sem
    // ela a guarda barraria por ausência até quem está no banco local certo.
    expect(carga, "o embrulho não carrega o .env").toBeGreaterThan(-1);
    expect(guarda, "o embrulho não chama exigirBancoLocal").toBeGreaterThan(-1);
    expect(delegacao, "o embrulho não delega ao Prisma").toBeGreaterThan(-1);
    expect(carga).toBeLessThan(guarda);
    expect(guarda).toBeLessThan(delegacao);
  });

  it("recusa migrate deploy em vez de guardá-lo", () => {
    const fonte = lerFonte(CAMINHO_EMBRULHO);

    expect(fonte).toMatch(/argumentos\[0\] === "migrate" && argumentos\[1\] === "deploy"/);
    expect(fonte).toContain("npm run prisma:deploy");
  });
});

describe("o embrulho: barra de verdade um banco remoto", () => {
  /**
   * Roda o embrulho como processo, do jeito que `npm run prisma:push` roda.
   *
   * O host é `.invalid`, TLD reservado pela RFC 2606 que nunca resolve em DNS.
   * Isso é deliberado: se a guarda falhar e o Prisma for chamado mesmo assim, o
   * `db push` morre na resolução de nome sem tocar em banco nenhum. Um teste
   * que verifica uma barreira contra escrita não pode ser o que escreve.
   */
  const URL_REMOTA_INOFENSIVA = "postgresql://usuario:senha@banco-de-producao.invalid:5432/acerto";

  function binarioDoTsx(): string {
    const pasta = path.resolve(RAIZ, "node_modules/tsx");
    const bin = JSON.parse(lerFonte(path.join(pasta, "package.json"))).bin;
    const relativo = typeof bin === "string" ? bin : bin?.tsx;

    expect(typeof relativo, "não achei o binário do tsx").toBe("string");
    return path.resolve(pasta, relativo);
  }

  it("sai com erro, explica o motivo e não chega a chamar o Prisma", () => {
    const execucao = spawnSync(
      process.execPath,
      [binarioDoTsx(), CAMINHO_EMBRULHO, "db", "push"],
      {
        cwd: RAIZ,
        encoding: "utf-8",
        timeout: 60_000,
        env: {
          ...process.env,
          DATABASE_URL: URL_REMOTA_INOFENSIVA,
          PERMITIR_BANCO_NAO_LOCAL: "",
        },
      }
    );

    const saida = `${execucao.stdout ?? ""}${execucao.stderr ?? ""}`;

    expect(execucao.status, `saída completa:\n${saida}`).not.toBe(0);
    expect(saida).toContain("[guarda de banco]");
    expect(saida).toContain("banco-de-producao.invalid");
    // O Prisma anuncia o schema carregado assim que sobe. Se esta linha
    // aparecer, o embrulho delegou apesar do bloqueio.
    expect(saida, "o Prisma chegou a ser executado").not.toContain("Prisma schema loaded");
    // Sem pilha de exceção: a mensagem tem instrução e a pilha a empurraria
    // para fora da tela.
    expect(saida).not.toContain("at exigirBancoLocal");
  }, 90_000);
});

describe("honestidade: a guarda diz o que não cobre", () => {
  it("a mensagem de bloqueio avisa que confere host, não identidade do banco", () => {
    const mensagem = mensagemDeBloqueio(
      "O comando `prisma db push`",
      avaliarBancoDeDados("postgresql://u:p@db.provedor.com:5432/acerto", undefined)
    );

    expect(mensagem).toContain("HOST");
    expect(mensagem).toMatch(/t[úu]nel/i);
    expect(mensagem).toContain("cloud-sql-proxy");
    expect(mensagem).toContain("ssh -L");
    expect(mensagem).toContain("LIBERA");
  });

  it("o cabeçalho do arquivo registra o mesmo limite, para quem for mexer nela", () => {
    const fonte = lerFonte(CAMINHO_GUARDA);
    const cabecalho = fonte.slice(0, fonte.indexOf("export const VARIAVEL_DE_ESCAPE"));

    expect(cabecalho).toMatch(/t[úu]nel/i);
    expect(cabecalho).toContain("cloud-sql-proxy");
    expect(cabecalho).toContain("ssh -L");
    // O ponto que justifica documentar em vez de tentar adivinhar.
    expect(cabecalho).toContain("identidade do banco");
  });

  it("túnel realmente passa, e isso está testado para ninguém achar que é bug", () => {
    // Se algum dia alguém "consertar" isto com heurística de porta, este teste
    // cai e a conversa acontece antes do merge, não depois.
    expect(bancoEhLocal("postgresql://u:p@localhost:5432/producao")).toBe(true);
    expect(avaliarBancoDeDados("postgresql://u:p@localhost:5432/producao", undefined).situacao).toBe("local");
  });
});
