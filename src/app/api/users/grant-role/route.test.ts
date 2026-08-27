import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createTestUser, cleanupTestData } from "@/test-helpers/fixtures";

/**
 * Contorno temporário (27/08/2026): concede papel via POST enquanto o PATCH
 * de /admin/acessos segue bloqueado numa camada de rede na frente da
 * aplicação (achado real, reportado ao Daniel). Só concede, nunca revoga.
 */

const session = vi.hoisted(() => ({ current: null as { user: { roles?: string[] } } | null }));
vi.mock("next-auth", () => ({ getServerSession: async () => session.current }));

const { POST } = await import("./route");

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/users/grant-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

describe("POST /api/users/grant-role", () => {
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
    const alvo = await createTestUser(["SOLICITANTE"]);

    const res = await post({ email: alvo.email, role: "ADMIN" });

    expect(res.status).toBe(403);
  });

  it("concede o papel sem remover os que a pessoa já tinha", async () => {
    const alvo = await createTestUser(["COMPRADOR"]);

    const res = await post({ email: alvo.email, role: "ADMIN" });

    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo).toEqual({ ok: true, jaTinha: false });

    const gravado = await prisma.user.findUniqueOrThrow({ where: { id: alvo.id }, include: { roles: true } });
    expect(gravado.roles.map((r) => r.role).sort()).toEqual(["ADMIN", "COMPRADOR"].sort());
    expect(gravado.canViewBoard).toBe(true);
  });

  it("é idempotente: conceder de novo não duplica nem falha", async () => {
    const alvo = await createTestUser(["ADMIN"]);

    const res = await post({ email: alvo.email, role: "ADMIN" });

    expect(res.status).toBe(200);
    expect((await res.json()).jaTinha).toBe(true);
    const papeis = await prisma.userRole.findMany({ where: { userId: alvo.id, role: "ADMIN" } });
    expect(papeis).toHaveLength(1);
  });

  it("recusa papel inválido", async () => {
    const alvo = await createTestUser(["SOLICITANTE"]);

    const res = await post({ email: alvo.email, role: "SUPER_ADMIN" });

    expect(res.status).toBe(400);
  });

  it("recusa e-mail que não existe", async () => {
    const res = await post({ email: "ninguem-aqui@acerto.com.br", role: "ADMIN" });

    expect(res.status).toBe(404);
  });

  it("não dá canViewBoard a um papel que não concede acesso ao quadro", async () => {
    const alvo = await createTestUser([]);

    const res = await post({ email: alvo.email, role: "JURIDICO" });

    expect(res.status).toBe(200);
    const gravado = await prisma.user.findUniqueOrThrow({ where: { id: alvo.id } });
    expect(gravado.canViewBoard).toBe(false);
  });
});
