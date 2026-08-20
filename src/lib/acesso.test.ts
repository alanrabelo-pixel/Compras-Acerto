import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createTestUser, createTestCostCenter, createTestRequest, cleanupTestData, TEST_PREFIX } from "@/test-helpers/fixtures";

/**
 * Teste da primitiva de acesso.
 *
 * Ela é o ponto único de falha das 16 rotas de leitura protegidas: se a regra
 * estiver errada aqui, está errada em todas ao mesmo tempo. Por isso o teste
 * exercita a regra diretamente, não através das rotas.
 *
 * Arquivo separado e com a flag desligada pelo mesmo motivo do route.auth.test:
 * a suíte roda com LOCAL_BYPASS_AUTH="true", e é justamente essa flag que faz
 * toda checagem passar. Um teste de autorização escrito sem desligá-la passa
 * sem exercer nada.
 */

const session = vi.hoisted(() => ({
  current: null as { user: { id?: string; email?: string; roles?: string[]; canViewBoard?: boolean } } | null,
}));

vi.mock("next-auth", () => ({
  getServerSession: async () => session.current,
}));

const {
  atorDaSessao,
  exigirLeituraDeSolicitacao,
  exigirLeituraDeChamado,
  exigirLeituraDeContrato,
  exigirQuadro,
  exigirPapel,
} = await import("./acesso");

beforeEach(() => {
  vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
  session.current = null;
});

function entrarComo(u: { id: string; email: string }, opcoes: { veQuadro?: boolean; papeis?: string[] } = {}) {
  session.current = {
    user: { id: u.id, email: u.email, roles: opcoes.papeis ?? [], canViewBoard: opcoes.veQuadro ?? false },
  };
}

async function cenario() {
  const solicitante = await createTestUser([]);
  const gestor = await createTestUser(["APROVADOR"]);
  const estranho = await createTestUser([]);
  const cc = await createTestCostCenter();
  const req = await createTestRequest({
    requesterId: solicitante.id,
    approverManagerId: gestor.id,
    costCenterId: cc.id,
    currentStage: "COTACAO",
  });
  return { solicitante, gestor, estranho, req };
}

describe("atorDaSessao", () => {
  it("devolve null sem sessão", async () => {
    expect(await atorDaSessao()).toBeNull();
  });

  it("devolve null quando a sessão não tem id, que é como uma pessoa desativada aparece", async () => {
    session.current = { user: { email: "alguem@acerto.com.br", roles: ["COMPRADOR"], canViewBoard: true } };
    expect(await atorDaSessao()).toBeNull();
  });

  it("aceita a coluna canViewBoard ligada", async () => {
    session.current = { user: { id: "x", email: "x@acerto.com.br", roles: [], canViewBoard: true } };
    expect((await atorDaSessao())?.veQuadro).toBe(true);
  });

  it("aceita papel de quadro mesmo com a coluna desligada, porque a coluna vem velha do seed", async () => {
    // Medido em 20/08/2026: 11 dos 22 usuários ativos têm papel de quadro com
    // a coluna em false, incluindo a Controladoria. Barrá-los seria punir dado
    // velho, não decisão de acesso.
    session.current = { user: { id: "x", email: "x@acerto.com.br", roles: ["CONTROLADORIA"], canViewBoard: false } };
    expect((await atorDaSessao())?.veQuadro).toBe(true);
  });

  it("não dá quadro a quem só solicita", async () => {
    session.current = { user: { id: "x", email: "x@acerto.com.br", roles: ["SOLICITANTE"], canViewBoard: false } };
    expect((await atorDaSessao())?.veQuadro).toBe(false);
  });
});

describe("exigirLeituraDeSolicitacao", () => {
  it("401 sem sessão", async () => {
    const { req } = await cenario();
    const r = await exigirLeituraDeSolicitacao(req.id);
    expect(r?.status).toBe(401);
  });

  it("libera quem tem acesso ao quadro", async () => {
    const { req, estranho } = await cenario();
    entrarComo(estranho, { veQuadro: true, papeis: ["COMPRADOR"] });
    expect(await exigirLeituraDeSolicitacao(req.id)).toBeNull();
  });

  it("libera o solicitante mesmo sem acesso ao quadro", async () => {
    const { req, solicitante } = await cenario();
    entrarComo(solicitante);
    expect(await exigirLeituraDeSolicitacao(req.id)).toBeNull();
  });

  it("libera o gestor aprovador da solicitação", async () => {
    const { req, gestor } = await cenario();
    entrarComo(gestor);
    expect(await exigirLeituraDeSolicitacao(req.id)).toBeNull();
  });

  it("libera quem é aprovador de alçada designado naquela solicitação", async () => {
    const { req, estranho } = await cenario();
    await prisma.approval.create({
      data: { requestId: req.id, level: 1, approverId: estranho.id, decision: "PENDENTE" },
    });
    entrarComo(estranho);
    expect(await exigirLeituraDeSolicitacao(req.id)).toBeNull();
  });

  it("libera quem atua na etapa em que a solicitação está agora", async () => {
    // Jurídico, Privacidade, Fiscal e Tesouraria não estão em BOARD_ROLES e
    // não aparecem como parte em campo nenhum: sem esta regra levariam 403
    // justamente na solicitação que estão processando.
    const { req } = await cenario();
    await prisma.purchaseRequest.update({ where: { id: req.id }, data: { currentStage: "JURIDICO" } });
    const juridico = await createTestUser(["JURIDICO"]);
    entrarComo(juridico, { papeis: ["JURIDICO"] });
    expect(await exigirLeituraDeSolicitacao(req.id)).toBeNull();
  });

  it("não libera o papel de outra etapa que não a atual", async () => {
    const { req } = await cenario();
    await prisma.purchaseRequest.update({ where: { id: req.id }, data: { currentStage: "JURIDICO" } });
    const fiscal = await createTestUser(["FISCAL"]);
    entrarComo(fiscal, { papeis: ["FISCAL"] });
    const r = await exigirLeituraDeSolicitacao(req.id);
    expect(r?.status).toBe(403);
  });

  it("403 para quem não é parte e não tem quadro", async () => {
    const { req, estranho } = await cenario();
    entrarComo(estranho);
    const r = await exigirLeituraDeSolicitacao(req.id);
    expect(r?.status).toBe(403);
  });

  it("403, e não 404, para id inexistente: 404 confirmaria a existência do id para quem varre", async () => {
    const { estranho } = await cenario();
    entrarComo(estranho);
    const r = await exigirLeituraDeSolicitacao("id-que-nao-existe");
    expect(r?.status).toBe(403);
  });

  it("libera tudo quando o bypass de desenvolvimento está ligado", async () => {
    const { req } = await cenario();
    vi.stubEnv("LOCAL_BYPASS_AUTH", "true");
    expect(await exigirLeituraDeSolicitacao(req.id)).toBeNull();
  });
});

describe("exigirLeituraDeChamado", () => {
  async function chamadoDe(email: string) {
    return prisma.simpleTicket.create({
      data: {
        code: `${TEST_PREFIX}TCK-${Math.random().toString(36).slice(2, 8)}`,
        category: "VIAGENS",
        requesterName: `${TEST_PREFIX} pessoa`,
        requesterEmail: email,
        description: "chamado de teste",
      },
    });
  }

  it("libera o dono do chamado, comparando e-mail sem diferenciar maiúscula", async () => {
    const dono = await createTestUser([]);
    const chamado = await chamadoDe(dono.email.toUpperCase());
    entrarComo(dono);
    expect(await exigirLeituraDeChamado(chamado.id)).toBeNull();
  });

  it("403 para quem não abriu e não tem quadro", async () => {
    const dono = await createTestUser([]);
    const outro = await createTestUser([]);
    const chamado = await chamadoDe(dono.email);
    entrarComo(outro);
    const r = await exigirLeituraDeChamado(chamado.id);
    expect(r?.status).toBe(403);
  });
});

describe("exigirLeituraDeContrato", () => {
  async function contratoDe(gestorId: string) {
    return prisma.contract.create({
      data: {
        supplierName: `${TEST_PREFIX} fornecedor`,
        area: "Tecnologia",
        costCenter: `${TEST_PREFIX} cc`,
        contractManagerId: gestorId,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
        renewalDate: new Date("2026-10-01"),
      },
    });
  }

  it("libera o gestor daquele contrato mesmo sem quadro", async () => {
    const gestor = await createTestUser([]);
    const contrato = await contratoDe(gestor.id);
    entrarComo(gestor);
    expect(await exigirLeituraDeContrato(contrato.id)).toBeNull();
  });

  it("403 para quem não gerencia e não tem quadro", async () => {
    const gestor = await createTestUser([]);
    const outro = await createTestUser([]);
    const contrato = await contratoDe(gestor.id);
    entrarComo(outro);
    const r = await exigirLeituraDeContrato(contrato.id);
    expect(r?.status).toBe(403);
  });
});

describe("exigirQuadro e exigirPapel", () => {
  it("exigirQuadro barra quem não tem a coluna ligada", async () => {
    const pessoa = await createTestUser([]);
    entrarComo(pessoa);
    const r = await exigirQuadro("a exportação da base");
    expect(r?.status).toBe(403);
  });

  it("exigirQuadro libera quem tem", async () => {
    const pessoa = await createTestUser(["COMPRADOR"]);
    entrarComo(pessoa, { veQuadro: true });
    expect(await exigirQuadro()).toBeNull();
  });

  it("exigirPapel libera ADMIN mesmo fora da lista pedida", async () => {
    const admin = await createTestUser(["ADMIN"]);
    entrarComo(admin, { papeis: ["ADMIN"] });
    expect(await exigirPapel(["FISCAL"])).toBeNull();
  });

  it("exigirPapel barra quem não tem o papel", async () => {
    const pessoa = await createTestUser(["COMPRADOR"]);
    entrarComo(pessoa, { papeis: ["COMPRADOR"], veQuadro: true });
    const r = await exigirPapel(["ADMIN"], "a configuração de alçadas");
    expect(r?.status).toBe(403);
  });
});

afterAll(async () => {
  await prisma.contract.deleteMany({ where: { costCenter: { contains: TEST_PREFIX } } });
  await prisma.simpleTicket.deleteMany({ where: { code: { contains: TEST_PREFIX } } });
  await cleanupTestData();
});
