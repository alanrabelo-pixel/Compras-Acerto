import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createTestUser, cleanupTestData, TEST_PREFIX } from "@/test-helpers/fixtures";

/**
 * Cadastro em massa de centros de custo, com gestor já vinculado (pedido do
 * dono do sistema em 27/08/2026, logo após o cadastro em massa de usuários).
 * Nunca cria usuário: o gestor precisa já existir, resolvido por e-mail.
 */

const session = vi.hoisted(() => ({ current: null as { user: { roles?: string[] } } | null }));
vi.mock("next-auth", () => ({ getServerSession: async () => session.current }));

const { POST } = await import("./route");

function post(items: unknown) {
  return POST(
    new NextRequest("http://localhost/api/cost-centers/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    })
  );
}

describe("POST /api/cost-centers/import", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    session.current = { user: { roles: ["ADMIN"] } };
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.costCenter.deleteMany({ where: { name: { contains: TEST_PREFIX } } });
    await cleanupTestData();
  });

  it("recusa com 403 quem não é ADMIN", async () => {
    session.current = { user: { roles: ["COMPRADOR"] } };

    const res = await post([{ name: `${TEST_PREFIX}Centro`, managerEmail: "alguem@acerto.com.br" }]);

    expect(res.status).toBe(403);
  });

  it("cria o centro, vincula o gestor e concede Aprovador", async () => {
    const gestor = await prisma.user.create({
      data: { name: "Gestor Novo", email: `${TEST_PREFIX}gestor1@acerto.com.br`, roles: { create: [{ role: "SOLICITANTE" }] } },
    });
    const nomeDoCentro = `${TEST_PREFIX}Centro Novo`;

    const res = await post([{ name: nomeDoCentro, managerEmail: gestor.email }]);

    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.criados).toEqual([nomeDoCentro]);

    const centro = await prisma.costCenter.findUniqueOrThrow({
      where: { name: nomeDoCentro },
      include: { managers: true },
    });
    expect(centro.managers.map((m) => m.id)).toEqual([gestor.id]);

    const papeis = await prisma.userRole.findMany({ where: { userId: gestor.id } });
    expect(papeis.map((p) => p.role)).toEqual(expect.arrayContaining(["SOLICITANTE", "APROVADOR"]));
  });

  it("não recria um centro que já existe, só adiciona o gestor sem remover os outros", async () => {
    const gestorAntigo = await createTestUser(["APROVADOR"]);
    const gestorNovo = await prisma.user.create({
      data: { name: "Gestor Adicional", email: `${TEST_PREFIX}gestor2@acerto.com.br`, roles: { create: [{ role: "SOLICITANTE" }] } },
    });
    const nomeDoCentro = `${TEST_PREFIX}Centro Existente`;
    await prisma.costCenter.create({ data: { name: nomeDoCentro, managers: { connect: { id: gestorAntigo.id } } } });

    const res = await post([{ name: nomeDoCentro, managerEmail: gestorNovo.email }]);

    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.atualizados).toEqual([nomeDoCentro]);
    expect(corpo.criados).toEqual([]);

    const centro = await prisma.costCenter.findUniqueOrThrow({
      where: { name: nomeDoCentro },
      include: { managers: true },
    });
    expect(centro.managers.map((m) => m.id).sort()).toEqual([gestorAntigo.id, gestorNovo.id].sort());
  });

  it("reporta gestor não encontrado, sem criar usuário nem centro", async () => {
    const nomeDoCentro = `${TEST_PREFIX}Centro Orfao`;

    const res = await post([{ name: nomeDoCentro, managerEmail: `${TEST_PREFIX}nao-existe@acerto.com.br` }]);

    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.gestorNaoEncontrado).toHaveLength(1);
    expect(corpo.criados).toEqual([]);
    await expect(prisma.costCenter.findUnique({ where: { name: nomeDoCentro } })).resolves.toBeNull();
  });

  it("recusa lista vazia", async () => {
    const res = await post([]);

    expect(res.status).toBe(400);
  });
});
