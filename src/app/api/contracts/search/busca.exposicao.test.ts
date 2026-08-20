import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createTestUser, cleanupTestData, TEST_PREFIX } from "@/test-helpers/fixtures";

/**
 * Busca de contratos: a exposição é deliberada, o despejo não era.
 *
 * GET /api/contracts/search continua aberto a qualquer pessoa autenticada, e
 * isso é decisão, não esquecimento: ele alimenta o ContractPicker do
 * formulário de dúvida jurídica sobre contrato ativo, que todo colaborador
 * abre. Exigir canViewBoard aqui derrubaria o formulário para justamente quem
 * ele existe para atender.
 *
 * O que não era decisão: sem o parâmetro `q` o filtro ficava só em
 * status ATIVO, e a rota devolvia 25 contratos com fornecedor e objeto. Um
 * seletor virava um download da carteira, disponível a qualquer conta
 * @acerto.com.br sem precisar saber o nome de fornecedor nenhum. Agora a rota
 * só responde a partir de um termo de 3 caracteres: quem sabe o que procura
 * acha, quem quer a carteira inteira precisa adivinhá-la termo a termo.
 *
 * Arquivo separado dos demais testes de rota pelo motivo de sempre nesta base:
 * a suíte roda com LOCAL_BYPASS_AUTH="true" (vem do .env via
 * vitest.config.ts), e a flag ligada faz as guardas de src/lib/acesso.ts
 * liberarem tudo. Aqui ela é desligada e getServerSession é mockado, que é o
 * caminho real de produção. Sem isso, o teste de "colaborador comum continua
 * achando o contrato" passaria por causa do bypass, e não por causa da regra.
 */

type SessaoFalsa = {
  user: { id?: string; email?: string | null; roles?: string[]; canViewBoard?: boolean };
} | null;

const session = vi.hoisted(() => ({ current: null as SessaoFalsa }));

vi.mock("next-auth", () => ({
  getServerSession: async () => session.current,
}));

const { GET } = await import("./route");

function busca(q?: string) {
  const url =
    q === undefined
      ? "http://localhost/api/contracts/search"
      : `http://localhost/api/contracts/search?q=${encodeURIComponent(q)}`;
  return GET(new NextRequest(url, { method: "GET" }));
}

type Resultado = { id: string; supplierName: string; supplierTradeName: string | null; contractObject: string | null };

async function corpo(res: Response): Promise<Resultado[]> {
  return (await res.json()) as Resultado[];
}

/**
 * Monta a sessão do jeito que o callback session() de src/lib/auth.ts monta em
 * produção: id, papéis e canViewBoard saem das colunas do banco a cada
 * chamada. Escrever o objeto na mão deixaria passar um cenário que a produção
 * nunca produz.
 */
async function sessaoDe(userId: string): Promise<SessaoFalsa> {
  const dbUser = await prisma.user.findUnique({ where: { id: userId }, include: { roles: true } });
  if (!dbUser || !dbUser.active) {
    return { user: { id: undefined, email: dbUser?.email, roles: [], canViewBoard: false } };
  }
  return {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      roles: dbUser.roles.map((r) => r.role),
      canViewBoard: dbUser.canViewBoard,
    },
  };
}

/**
 * Dois contratos do mesmo fornecedor fictício: um ATIVO, que é o que a busca
 * deve achar, e um CANCELADO casando com o mesmo termo, para provar que o
 * recorte por status não foi perdido junto com a mudança do where.
 *
 * O nome do fornecedor carrega o TEST_PREFIX (aleatório por arquivo de teste)
 * de propósito: é ele que serve de termo de busca, e assim o resultado não
 * depende do que houver no banco de desenvolvimento nem do que outro arquivo
 * estiver criando em paralelo.
 */
async function cenario() {
  const gestor = await createTestUser([]);
  const comum = await createTestUser(["SOLICITANTE"]);

  const base = {
    area: "Tecnologia",
    costCenter: `${TEST_PREFIX} cc`,
    contractManagerId: gestor.id,
    startDate: new Date("2026-01-01"),
    endDate: new Date("2026-12-31"),
    renewalDate: new Date("2026-10-01"),
  };

  const ativo = await prisma.contract.create({
    data: {
      ...base,
      supplierName: `${TEST_PREFIX} Fornecedor Sigiloso Ltda`,
      supplierTradeName: `${TEST_PREFIX} Sigiloso`,
      contractObject: `Manutencao predial ${TEST_PREFIX} objeto`,
      status: "ATIVO",
    },
  });

  const cancelado = await prisma.contract.create({
    data: {
      ...base,
      supplierName: `${TEST_PREFIX} Fornecedor Sigiloso Ltda`,
      supplierTradeName: `${TEST_PREFIX} Sigiloso`,
      contractObject: `Contrato encerrado ${TEST_PREFIX} objeto`,
      status: "CANCELADO",
    },
  });

  return { gestor, comum, ativo, cancelado };
}

describe("GET /api/contracts/search: só responde a quem sabe o que procura", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    session.current = null;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    // Contract não é coberto por cleanupTestData e tem FK para User
    // (contractManagerId): sem apagar antes, o deleteMany de usuários estoura.
    await prisma.contract.deleteMany({ where: { costCenter: { contains: TEST_PREFIX } } });
    await cleanupTestData();
  });

  it("sem termo nenhum lista os contratos ativos: o seletor abre preenchido", async () => {
    // Decisão do dono do sistema em 20/08/2026. Uma versão anterior desta rota
    // exigia termo de 3 letras e devolvia vazio sem ele, e este arquivo
    // afirmava isso. Perguntado entre fechar a exposição e manter o
    // comportamento do formulário, ele escolheu manter a lista e ganhar a
    // busca por cima. A exposição da carteira de contratos ativos para
    // qualquer colaborador autenticado é, portanto, deliberada.
    const { comum, ativo } = await cenario();
    session.current = await sessaoDe(comum.id);

    const res = await busca();

    expect(res.status).toBe(200);
    const lista = await corpo(res);
    expect(lista.map((c) => c.id)).toContain(ativo.id);
  });

  it("termo curto não é tratado como busca: continua listando, em vez de zerar a tela", async () => {
    const { comum, ativo } = await cenario();
    session.current = await sessaoDe(comum.id);

    for (const termo of ["", "  "]) {
      const res = await busca(termo);
      expect(res.status, `termo "${termo}" deveria ser 200`).toBe(200);
      const lista = await corpo(res);
      expect(lista.map((c) => c.id), `termo "${termo}" deveria listar`).toContain(ativo.id);
    }
  });

  it("a resposta traz só os quatro campos do seletor, não o contrato inteiro", async () => {
    // O registro completo tem valor, cláusulas e CNPJ. O seletor precisa de
    // quatro campos, e é só isso que sai.
    const { comum } = await cenario();
    session.current = await sessaoDe(comum.id);

    const lista = await corpo(await busca());

    expect(lista.length).toBeGreaterThan(0);
    expect(Object.keys(lista[0]).sort()).toEqual(
      ["contractObject", "id", "supplierName", "supplierTradeName"].sort()
    );
  });

  it("nunca responde erro enquanto a pessoa digita: termo curto é 200, não 400", async () => {
    const { comum } = await cenario();
    session.current = await sessaoDe(comum.id);

    for (const termo of ["", " ", "a", "ab"]) {
      const res = await busca(termo);
      expect(res.status, `termo "${termo}" deveria ser 200`).toBe(200);
    }
  });

  it("termo válido acha o contrato ativo pela razão social", async () => {
    const { comum, ativo } = await cenario();
    session.current = await sessaoDe(comum.id);

    const res = await busca(TEST_PREFIX);
    const lista = await corpo(res);

    expect(res.status).toBe(200);
    expect(lista.map((c) => c.id)).toContain(ativo.id);
  });

  it("termo válido acha pelo objeto do contrato, e o objeto volta na resposta", async () => {
    const { comum, ativo } = await cenario();
    session.current = await sessaoDe(comum.id);

    const res = await busca(`Manutencao predial ${TEST_PREFIX}`);
    const achado = (await corpo(res)).find((c) => c.id === ativo.id);

    // contractObject não pode sumir da resposta: o ContractPicker o usa no
    // rótulo da opção, e sem ele um fornecedor com três contratos vira três
    // linhas idênticas no seletor.
    expect(achado?.contractObject).toBe(ativo.contractObject);
    expect(achado?.supplierTradeName).toBe(ativo.supplierTradeName);
  });

  it("busca com outra caixa continua achando, o insensitive não se perdeu", async () => {
    const { comum, ativo } = await cenario();
    session.current = await sessaoDe(comum.id);

    const res = await busca(TEST_PREFIX.toUpperCase());

    expect((await corpo(res)).map((c) => c.id)).toContain(ativo.id);
  });

  it("contrato cancelado não aparece, mesmo casando com o termo", async () => {
    const { comum, cancelado } = await cenario();
    session.current = await sessaoDe(comum.id);

    const res = await busca(TEST_PREFIX);

    expect((await corpo(res)).map((c) => c.id)).not.toContain(cancelado.id);
  });

  it("colaborador sem papel de quadro continua achando: a abertura é deliberada", async () => {
    // Trava a decisão. Se alguém puser exigirQuadro nesta rota, o formulário de
    // dúvida jurídica sobre contrato ativo para de funcionar para quase toda a
    // empresa, e é este teste que avisa antes de ir para produção.
    const { ativo } = await cenario();
    const semQuadro = await createTestUser([]);
    session.current = await sessaoDe(semQuadro.id);

    const res = await busca(TEST_PREFIX);

    expect(res.status).toBe(200);
    expect((await corpo(res)).map((c) => c.id)).toContain(ativo.id);
  });
});
