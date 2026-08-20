import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createTestUser, cleanupTestData, TEST_PREFIX } from "@/test-helpers/fixtures";

/**
 * Autorização de leitura de um contrato específico.
 *
 * Antes da guarda, GET /api/contracts/[id] entregava o contrato inteiro
 * (fornecedor, CNPJ, objeto, condição de pagamento, cláusulas e a solicitação
 * de origem) para qualquer conta autenticada que soubesse ou adivinhasse o id.
 *
 * O recorte é o mesmo da tela: quadro, mais o gestor daquele contrato, que
 * precisa enxergar o que gerencia mesmo sem quadro.
 *
 * Arquivo separado porque a suíte roda com LOCAL_BYPASS_AUTH="true" (vem do
 * .env via vitest.config.ts), e com a flag ligada toda checagem passa.
 */

type Claims = { id?: string; email?: string; roles?: string[]; canViewBoard?: boolean };
const session = vi.hoisted(() => ({ current: null as { user: Claims } | null }));

vi.mock("next-auth", () => ({
  getServerSession: async () => session.current,
}));

const { GET } = await import("./route");

function getRequest(id: string) {
  return new NextRequest(`http://localhost/api/contracts/${id}`);
}

/**
 * Monta a sessão exatamente como o callback session() de src/lib/auth.ts
 * monta: id, e-mail, papéis e a COLUNA canViewBoard, lidos do banco.
 */
async function entrarComo(usuario: { id: string }) {
  const dbUser = await prisma.user.findUnique({ where: { id: usuario.id }, include: { roles: true } });
  if (!dbUser) throw new Error("Usuário de teste não encontrado.");
  session.current = {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      roles: dbUser.roles.map((r) => r.role),
      canViewBoard: dbUser.canViewBoard,
    },
  };
}

/** Papel de quadro só vale com a coluna ligada, que é o que /admin/acessos faz. */
async function criarUsuarioComQuadro(papel: "COMPRADOR" | "CONTROLADORIA") {
  const usuario = await createTestUser([papel]);
  return prisma.user.update({ where: { id: usuario.id }, data: { canViewBoard: true } });
}

async function criarContrato(contractManagerId: string) {
  const agora = new Date();
  return prisma.contract.create({
    data: {
      supplierName: `Fornecedor ${TEST_PREFIX}`,
      startDate: agora,
      endDate: new Date(agora.getTime() + 365 * 86_400_000),
      renewalDate: new Date(agora.getTime() + 300 * 86_400_000),
      contractManagerId,
      area: "Tecnologia",
      costCenter: `Centro ${TEST_PREFIX}`,
      contractObject: "Objeto sigiloso do contrato de teste.",
    },
  });
}

/** Contract não é coberto por cleanupTestData, e prende o User pela FK. */
async function limparContratos() {
  const contratos = await prisma.contract.findMany({
    where: { supplierName: { contains: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = contratos.map((c) => c.id);
  if (ids.length === 0) return;
  await prisma.contractAlert.deleteMany({ where: { contractId: { in: ids } } });
  await prisma.contract.deleteMany({ where: { id: { in: ids } } });
}

describe("GET /api/contracts/[id]: autorização", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    session.current = null;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await limparContratos();
    await cleanupTestData();
  });

  it("recusa quem não é o gestor e não tem quadro", async () => {
    const gestor = await createTestUser([]);
    const contrato = await criarContrato(gestor.id);
    const deFora = await createTestUser(["SOLICITANTE"]);
    await entrarComo(deFora);

    const res = await GET(getRequest(contrato.id), { params: { id: contrato.id } });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.contractObject).toBeUndefined();
    expect(body.supplierName).toBeUndefined();
  });

  it("permite o gestor daquele contrato, mesmo sem acesso ao quadro", async () => {
    const gestor = await createTestUser([]);
    const contrato = await criarContrato(gestor.id);
    await entrarComo(gestor);

    const res = await GET(getRequest(contrato.id), { params: { id: contrato.id } });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(contrato.id);
  });

  it("permite quem tem acesso ao quadro, sem ser gestor do contrato", async () => {
    const gestor = await createTestUser([]);
    const contrato = await criarContrato(gestor.id);
    const controladoria = await criarUsuarioComQuadro("CONTROLADORIA");
    await entrarComo(controladoria);

    const res = await GET(getRequest(contrato.id), { params: { id: contrato.id } });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(contrato.id);
  });

  it("recusa gestor de OUTRO contrato", async () => {
    const gestor = await createTestUser([]);
    const contrato = await criarContrato(gestor.id);
    const gestorDeOutro = await createTestUser([]);
    await criarContrato(gestorDeOutro.id);
    await entrarComo(gestorDeOutro);

    const res = await GET(getRequest(contrato.id), { params: { id: contrato.id } });

    expect(res.status).toBe(403);
  });

  it("recusa quando não há sessão nenhuma", async () => {
    const gestor = await createTestUser([]);
    const contrato = await criarContrato(gestor.id);
    session.current = null;

    const res = await GET(getRequest(contrato.id), { params: { id: contrato.id } });

    expect(res.status).toBe(401);
  });

  it("responde 403, e não 404, para id inexistente: 404 confirmaria o que existe", async () => {
    const deFora = await createTestUser(["SOLICITANTE"]);
    await entrarComo(deFora);

    const res = await GET(getRequest("nao-existe"), { params: { id: "nao-existe" } });

    expect(res.status).toBe(403);
  });
});
