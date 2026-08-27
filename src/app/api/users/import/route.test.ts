import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { cleanupTestData, TEST_PREFIX } from "@/test-helpers/fixtures";

/**
 * Cadastro em massa, ANTES de qualquer login via SSO (pedido do dono do
 * sistema em 27/08/2026): sem as pessoas cadastradas não dá para configurar
 * centro de custo nem aprovador. Precisa entrar como SOLICITANTE, sem tocar
 * em quem já existe, e sem mandar nada (nenhum e-mail, nenhum Slack).
 */

const session = vi.hoisted(() => ({ current: null as { user: { roles?: string[] } } | null }));
vi.mock("next-auth", () => ({ getServerSession: async () => session.current }));

const { POST } = await import("./route");

function post(users: unknown) {
  return POST(
    new NextRequest("http://localhost/api/users/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ users }),
    })
  );
}

describe("POST /api/users/import", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    session.current = { user: { roles: ["ADMIN"] } };
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await cleanupTestData();
  });

  it("recusa com 403 quem não é ADMIN", async () => {
    session.current = { user: { roles: ["COMPRADOR"] } };

    const res = await post([{ name: "Alguém", email: `${TEST_PREFIX}alguem@acerto.com.br` }]);

    expect(res.status).toBe(403);
  });

  it("cadastra como SOLICITANTE, sem exigir login antes", async () => {
    const email = `${TEST_PREFIX}novo-import@acerto.com.br`;

    const res = await post([{ name: "Pessoa Nova", email }]);

    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.criados).toEqual([email]);

    const gravado = await prisma.user.findUniqueOrThrow({ where: { email }, include: { roles: true } });
    expect(gravado.roles.map((r) => r.role)).toEqual(["SOLICITANTE"]);
    expect(gravado.googleId).toBeNull();
    expect(gravado.active).toBe(true);
  });

  it("ignora quem já existe, sem tocar nos papéis ou no status dela", async () => {
    // Direto via prisma, e não createTestUser: o e-mail de teste dela é
    // @teste.acerto.com.br, que a própria rota recusaria por domínio. Aqui o
    // ponto é o e-mail já existir, então precisa ser um domínio válido.
    const existente = await prisma.user.create({
      data: {
        name: "Pessoa Já Cadastrada",
        email: `${TEST_PREFIX}ja-cadastrada@acerto.com.br`,
        active: false,
        roles: { create: [{ role: "ADMIN" }] },
      },
    });

    const res = await post([{ name: "Nome Diferente", email: existente.email }]);

    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.jaExistiam).toEqual([existente.email]);
    expect(corpo.criados).toEqual([]);

    const inalterado = await prisma.user.findUniqueOrThrow({ where: { id: existente.id }, include: { roles: true } });
    expect(inalterado.name).toBe(existente.name);
    expect(inalterado.active).toBe(false);
    expect(inalterado.roles.map((r) => r.role)).toEqual(["ADMIN"]);
  });

  it("recusa e-mail fora de @acerto.com.br, sem derrubar o restante do lote", async () => {
    const emailValido = `${TEST_PREFIX}valido@acerto.com.br`;

    const res = await post([
      { name: "Fornecedor Externo", email: "alguem@fornecedor.com" },
      { name: "Pessoa Válida", email: emailValido },
    ]);

    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.criados).toEqual([emailValido]);
    expect(corpo.invalidos).toHaveLength(1);
    expect(corpo.invalidos[0]).toContain("fornecedor.com");
  });

  it("recusa nome vazio", async () => {
    const res = await post([{ name: "  ", email: `${TEST_PREFIX}sem-nome@acerto.com.br` }]);

    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.criados).toEqual([]);
    expect(corpo.invalidos).toHaveLength(1);
  });

  it("recusa lista vazia", async () => {
    const res = await post([]);

    expect(res.status).toBe(400);
  });
});
