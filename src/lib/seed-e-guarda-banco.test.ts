import { describe, it, expect, afterEach, afterAll, vi } from "vitest";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { createTestUser, cleanupTestData } from "@/test-helpers/fixtures";
import {
  avaliarBancoDeDados,
  exigirBancoLocal,
  hostDoBanco,
  HOSTS_LOCAIS,
  VALOR_DE_ESCAPE,
  VARIAVEL_DE_ESCAPE,
} from "./guarda-banco";

/**
 * Duas proteções que precisam existir antes de Produção e Sandbox virarem
 * projetos separados na Vercel:
 *
 * 1. O seed não pode mais cadastrar colegas de verdade. Com Slack ou Gmail
 *    ligados, um teste de fluxo manda mensagem real para essas pessoas.
 * 2. Nem o seed nem a suíte de testes podem rodar contra banco que não seja o
 *    Postgres local. As duas escrevem, e a suíte apaga em massa no cleanup.
 *
 * Os testes do item 1 leem o CÓDIGO-FONTE do seed em vez de importá-lo: o
 * arquivo instancia o PrismaClient e executa main() no import, então importar
 * seria escrever no banco. Ler a fonte também é o formato certo do risco, que
 * é literalmente "tem endereço real escrito no repositório".
 */

const RAIZ = process.cwd();
const CAMINHO_SEED = path.resolve(RAIZ, "prisma/seed.ts");
const CAMINHO_VITEST_CONFIG = path.resolve(RAIZ, "vitest.config.ts");
const CAMINHO_IMPORT_CONTRATOS = path.resolve(RAIZ, "src/app/api/contratos/import/route.ts");

function lerFonte(caminho: string): string {
  // Falha alto e claro se o caminho mudar de lugar: sem isto, um arquivo
  // inexistente viraria string vazia e todos os "não contém e-mail real"
  // passariam sozinhos, que é o pior fim possível para um teste destes.
  expect(fs.existsSync(caminho), `arquivo esperado não encontrado: ${caminho}`).toBe(true);
  return fs.readFileSync(caminho, "utf-8");
}

/**
 * E-mail com domínio da Acerto. Exige parte local colada no @ de propósito,
 * para casar com "alguem@acerto.com.br" e não com as menções em prosa dos
 * comentários (" @acerto.com.br", que é o domínio do SSO e precisa continuar
 * documentado).
 */
const EMAIL_REAL = /[A-Za-z0-9._%+-]+@acerto\.com\.br/g;

const URL_LOCAL = "postgresql://postgres:acertocompras123@localhost:5433/acerto_compras";
const URL_REMOTA = "postgresql://usuario:senha@ep-producao-123.sa-east-1.aws.neon.tech:5432/acerto_compras";

afterAll(async () => {
  await cleanupTestData();
});

describe("seed sintético: prisma/seed.ts não cadastra pessoa real", () => {
  it("não tem nenhum e-mail @acerto.com.br", () => {
    const fonte = lerFonte(CAMINHO_SEED);

    expect(fonte.match(EMAIL_REAL)).toBeNull();
  });

  it("não usa example.com, que é domínio existente e com dono", () => {
    const fonte = lerFonte(CAMINHO_SEED);

    expect(fonte).not.toMatch(/@example\.com/);
  });

  it("cadastra 22 pessoas, todas em @exemplo.invalid, sem e-mail repetido", () => {
    const fonte = lerFonte(CAMINHO_SEED);
    const emails = Array.from(fonte.matchAll(/email:\s*"([^"]+)"/g)).map((m) => m[1]);

    // 11 gestores de centro de custo + 11 usuários-chave, mesma quantidade da
    // lista de pessoas reais que existia antes.
    expect(emails).toHaveLength(22);
    expect(new Set(emails).size).toBe(22);
    for (const email of emails) {
      // .invalid é reservado pela RFC 2606 e nunca resolve em DNS: envio
      // acidental morre na resolução de nome, antes de sair.
      expect(email, `e-mail fora do domínio inexistente: ${email}`).toMatch(/@exemplo\.invalid$/);
    }
  });

  it("mantém um gestor por centro de custo, com os centros reais preservados", () => {
    const fonte = lerFonte(CAMINHO_SEED);
    const centrosDosGestores = Array.from(fonte.matchAll(/costCenter:\s*"([^"]+)"/g)).map((m) => m[1]);

    expect(centrosDosGestores).toHaveLength(11);
    expect(new Set(centrosDosGestores).size).toBe(11);
    // Centro de custo é estrutura da empresa, não destinatário de mensagem, e o
    // produto depende do nome para casar solicitação com alçada.
    expect(centrosDosGestores).toContain("Data Intelligence");
    expect(centrosDosGestores).toContain("Vendas e Sucesso do Cliente");
  });

  it("mantém a distribuição de papéis dos 11 usuários-chave", () => {
    const fonte = lerFonte(CAMINHO_SEED);
    const papeis = Array.from(fonte.matchAll(/\brole:\s*"([A-Z_]+)" as const/g)).map((m) => m[1]);

    const contagem: Record<string, number> = {};
    for (const papel of papeis) contagem[papel] = (contagem[papel] ?? 0) + 1;

    expect(contagem).toEqual({
      COMPRADOR: 3,
      JURIDICO: 1,
      TESOURARIA: 2,
      CONTROLADORIA: 2,
      APROVADOR: 1,
      PRIVACIDADE: 1,
      FISCAL: 1,
    });
    // Alçada da exceção orçamentária (ver budgetExceptionApproverRole).
    expect(fonte).toMatch(/extraRoles:\s*\["COORDENACAO"\]/);
    expect(fonte).toMatch(/extraRoles:\s*\["GERENTE_FNC"\]/);
  });

  it("continua criando pelo menos um ADMIN, que é o motivo de o checklist mandar rodar o seed", () => {
    const fonte = lerFonte(CAMINHO_SEED);
    const administradores = fonte.match(/admin:\s*true/g) ?? [];

    expect(administradores.length).toBeGreaterThanOrEqual(1);
    expect(fonte).toMatch(/role:\s*"ADMIN"/);
  });
});

describe("seed sintético: planilha modelo de contratos", () => {
  it("a linha de exemplo não traz e-mail no domínio da Acerto", () => {
    // O modelo é baixado e reenviado com edição parcial. Um endereço real de
    // exemplo sobrevive à edição, entra na importação e vira gestor de
    // contrato, que recebe aviso de renovação por e-mail e Slack.
    const fonte = lerFonte(CAMINHO_IMPORT_CONTRATOS);

    expect(fonte.match(EMAIL_REAL)).toBeNull();
    expect(fonte).toMatch(/"E-mail do Gestor":\s*"[^"]+@exemplo\.invalid"/);
  });

  it("a linha de exemplo não traz centro de custo real", () => {
    const fonte = lerFonte(CAMINHO_IMPORT_CONTRATOS);
    const exemplo = fonte.match(/const TEMPLATE_EXAMPLE = \{[\s\S]*?\};/)?.[0] ?? "";

    expect(exemplo).not.toBe("");
    expect(exemplo).not.toMatch(/Data Intelligence/);
    expect(exemplo).toMatch(/"Centro de Custo":\s*"[^"]*Exemplo"/);
  });
});

describe("guarda de banco: leitura do host", () => {
  it("extrai o host da string de conexão de desenvolvimento", () => {
    expect(hostDoBanco(URL_LOCAL)).toBe("localhost");
  });

  it("normaliza para minúsculas, porque o parser do Node não normaliza host de esquema não especial", () => {
    expect(hostDoBanco("postgresql://user:pw@LOCALHOST:5433/db")).toBe("localhost");
  });

  it("devolve null para ausente, vazio e string que não é URL", () => {
    expect(hostDoBanco(undefined)).toBeNull();
    expect(hostDoBanco("")).toBeNull();
    expect(hostDoBanco("   ")).toBeNull();
    expect(hostDoBanco("acerto_compras")).toBeNull();
  });

  it("pega o host de verdade quando há arroba no meio da senha", () => {
    // O host é o que vem depois do ÚLTIMO arroba. Uma leitura ingênua acharia
    // "localhost" aqui e liberaria uma conexão remota.
    expect(hostDoBanco("postgresql://user:senha@localhost@banco-de-producao.exemplo.net:5432/db"))
      .toBe("banco-de-producao.exemplo.net");
  });
});

describe("guarda de banco: veredito", () => {
  it("libera localhost e 127.0.0.1", () => {
    for (const host of HOSTS_LOCAIS) {
      const avaliacao = avaliarBancoDeDados(`postgresql://u:p@${host}:5433/db`, undefined);
      expect(avaliacao.situacao, `host=${host}`).toBe("local");
    }
  });

  it("bloqueia host remoto e diz qual é na mensagem", () => {
    const avaliacao = avaliarBancoDeDados(URL_REMOTA, undefined);

    expect(avaliacao.situacao).toBe("bloqueado");
    expect(avaliacao.host).toBe("ep-producao-123.sa-east-1.aws.neon.tech");
    expect(avaliacao.motivo).toContain("ep-producao-123.sa-east-1.aws.neon.tech");
  });

  it("falha fechada quando não dá para saber o host", () => {
    // Ausente, vazio e ilegível não ganham o benefício da dúvida.
    for (const valor of [undefined, "", "postgresql://", "isto-nao-e-url"]) {
      expect(avaliarBancoDeDados(valor, undefined).situacao, `valor=${JSON.stringify(valor)}`).toBe("bloqueado");
    }
  });

  it("bloqueia ::1, porque a lista de hosts é fechada e não uma heurística de loopback", () => {
    expect(avaliarBancoDeDados("postgresql://u:p@[::1]:5433/db", undefined).situacao).toBe("bloqueado");
  });

  it("a saída de emergência exige o valor exato, não qualquer valor verdadeiro", () => {
    for (const valor of ["true", "1", "sim", "yes", "eu sei o risco", "EU-SEI-O-RISCO", ""]) {
      expect(avaliarBancoDeDados(URL_REMOTA, valor).situacao, `valor=${JSON.stringify(valor)}`).toBe("bloqueado");
    }
  });

  it("a saída de emergência libera com o valor exato, e a situação fica marcada como tal", () => {
    const avaliacao = avaliarBancoDeDados(URL_REMOTA, VALOR_DE_ESCAPE);

    expect(avaliacao.situacao).toBe("liberado_por_escape");
  });

  it("banco local não vira 'liberado por escape' só porque a variável está no ambiente", () => {
    expect(avaliarBancoDeDados(URL_LOCAL, VALOR_DE_ESCAPE).situacao).toBe("local");
  });
});

describe("guarda de banco: exigirBancoLocal", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("interrompe quando o DATABASE_URL do ambiente é remoto", () => {
    vi.stubEnv("DATABASE_URL", URL_REMOTA);
    vi.stubEnv(VARIAVEL_DE_ESCAPE, undefined);

    expect(() => exigirBancoLocal("O seed")).toThrowError(/ep-producao-123\.sa-east-1\.aws\.neon\.tech/);
  });

  it("a mensagem explica o perigo, os hosts aceitos e como sair conscientemente", () => {
    vi.stubEnv("DATABASE_URL", URL_REMOTA);
    vi.stubEnv(VARIAVEL_DE_ESCAPE, undefined);

    let mensagem = "";
    try {
      exigirBancoLocal("O seed (npm run prisma:seed)");
    } catch (err) {
      mensagem = err instanceof Error ? err.message : String(err);
    }

    expect(mensagem).toContain("O seed (npm run prisma:seed)");
    expect(mensagem).toContain("ESCREVE no banco");
    expect(mensagem).toContain("localhost");
    expect(mensagem).toContain("5433");
    expect(mensagem).toContain(VARIAVEL_DE_ESCAPE);
    expect(mensagem).toContain(VALOR_DE_ESCAPE);
  });

  it("interrompe quando o DATABASE_URL some do ambiente", () => {
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv(VARIAVEL_DE_ESCAPE, undefined);

    expect(() => exigirBancoLocal("A suíte de testes")).toThrowError(/ausente/);
  });

  it("não interrompe o banco local", () => {
    vi.stubEnv("DATABASE_URL", URL_LOCAL);
    vi.stubEnv(VARIAVEL_DE_ESCAPE, undefined);

    expect(() => exigirBancoLocal("A suíte de testes")).not.toThrow();
  });

  it("com a saída de emergência, segue em frente mas grita no console", () => {
    vi.stubEnv("DATABASE_URL", URL_REMOTA);
    vi.stubEnv(VARIAVEL_DE_ESCAPE, VALOR_DE_ESCAPE);
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() => exigirBancoLocal("O seed")).not.toThrow();
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(String(aviso.mock.calls[0][0])).toContain("NÃO LOCAL");
  });
});

describe("guarda de banco: está ligada nos dois pontos de entrada", () => {
  // Sem estes dois, a guarda existiria como função e não protegeria nada.
  it("prisma/seed.ts chama a guarda antes de instanciar o PrismaClient", () => {
    const fonte = lerFonte(CAMINHO_SEED);
    const posicaoDaGuarda = fonte.indexOf("exigirBancoLocal(");
    const posicaoDoPrisma = fonte.indexOf("new PrismaClient(");

    expect(posicaoDaGuarda, "prisma/seed.ts não chama exigirBancoLocal").toBeGreaterThan(-1);
    expect(posicaoDoPrisma).toBeGreaterThan(-1);
    expect(posicaoDaGuarda).toBeLessThan(posicaoDoPrisma);
  });

  it("vitest.config.ts chama a guarda antes de exportar a configuração", () => {
    const fonte = lerFonte(CAMINHO_VITEST_CONFIG);
    const posicaoDaGuarda = fonte.indexOf("exigirBancoLocal(");
    const posicaoDoExport = fonte.indexOf("export default defineConfig(");

    expect(posicaoDaGuarda, "vitest.config.ts não chama exigirBancoLocal").toBeGreaterThan(-1);
    expect(posicaoDoExport).toBeGreaterThan(-1);
    expect(posicaoDaGuarda).toBeLessThan(posicaoDoExport);
  });
});

describe("guarda de banco: o ambiente de desenvolvimento continua funcionando", () => {
  it("o DATABASE_URL desta máquina passa na guarda e a suíte escreve no banco", async () => {
    // Fecha o outro lado do risco: uma guarda que bloqueasse o banco local
    // certo quebraria a suíte inteira, e este arquivo nem teria rodado.
    expect(() => exigirBancoLocal("A suíte de testes (vitest)")).not.toThrow();

    const usuario = await createTestUser(["SOLICITANTE"]);
    const lido = await prisma.user.findUnique({ where: { id: usuario.id } });

    expect(lido?.email).toBe(usuario.email);
  });
});
