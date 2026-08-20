import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createTestUser, cleanupTestData, TEST_PREFIX } from "@/test-helpers/fixtures";

/**
 * Autorização de leitura da carteira de contratos.
 *
 * Antes da guarda, GET /api/contracts devolvia a carteira inteira (fornecedor,
 * CNPJ, gestor, cláusulas, datas de renovação) para qualquer conta
 * autenticada, porque o middleware só exige sessão em /api/*. A tela
 * /contratos sempre exigiu canViewBoard; o que faltava era a API exigir o
 * mesmo, já que a rota é chamável direto.
 *
 * Arquivo separado por causa de LOCAL_BYPASS_AUTH="true" (vem do .env via
 * vitest.config.ts): com a flag ligada toda checagem passa, então um teste de
 * autorização escrito junto dos demais passaria sem exercer nada. Aqui a flag
 * é desligada e getServerSession é mockado, que é o caminho real de produção.
 */

type Claims = { id?: string; email?: string; roles?: string[]; canViewBoard?: boolean };
const session = vi.hoisted(() => ({ current: null as { user: Claims } | null }));

vi.mock("next-auth", () => ({
  getServerSession: async () => session.current,
}));

const { GET } = await import("./route");

/**
 * Monta a sessão exatamente como o callback session() de src/lib/auth.ts
 * monta: id, e-mail, papéis e a COLUNA canViewBoard, lidos do banco. Assim o
 * teste não inventa um formato de sessão que a produção não produz.
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
async function criarUsuarioComQuadro(papel: "COMPRADOR" | "CONTROLADORIA" | "ADMIN") {
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

describe("GET /api/contracts: autorização", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    session.current = null;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await limparContratos();
    await cleanupTestData();
  });

  it("recusa quem só solicita, sem acesso ao quadro", async () => {
    const gestor = await criarUsuarioComQuadro("COMPRADOR");
    await criarContrato(gestor.id);
    const deFora = await createTestUser(["SOLICITANTE"]);
    await entrarComo(deFora);

    const res = await GET();

    expect(res.status).toBe(403);
    // O corpo não pode ter vazado a carteira junto com o erro.
    const body = await res.json();
    expect(Array.isArray(body)).toBe(false);
  });

  it("recusa gestor de contrato que não tem quadro: a listagem é ampla demais", async () => {
    const gestor = await createTestUser([]);
    await criarContrato(gestor.id);
    await entrarComo(gestor);

    const res = await GET();

    expect(res.status).toBe(403);
  });

  it("permite quem tem acesso ao quadro", async () => {
    const gestor = await criarUsuarioComQuadro("COMPRADOR");
    const contrato = await criarContrato(gestor.id);
    await entrarComo(gestor);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((c: { id: string }) => c.id === contrato.id)).toBe(true);
  });

  it("recusa quando não há sessão nenhuma", async () => {
    session.current = null;

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it("recusa pessoa desativada, que aparece como sessão sem id", async () => {
    // É assim que a revogação chega até aqui: o callback session() de
    // src/lib/auth.ts zera o id (e os papéis) de quem foi desativado.
    session.current = { user: { email: "desativado@acerto.com.br", roles: [], canViewBoard: false } };

    const res = await GET();

    expect(res.status).toBe(401);
  });
});
