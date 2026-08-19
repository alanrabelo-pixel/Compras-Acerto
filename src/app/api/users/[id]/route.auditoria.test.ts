import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createTestUser, cleanupTestData } from "@/test-helpers/fixtures";

/**
 * UserRole e ApprovalLevelApprover eram apagados com deleteMany, sem registro
 * nenhum. São exatamente as duas tabelas que definem quem aprova dinheiro, e
 * "quem removeu o papel de fulano, quando e por quê" era irrespondível. Numa
 * auditoria de sistema financeiro é a primeira pergunta que fazem.
 */

const session = vi.hoisted(() => ({ current: null as { user: { id?: string; email?: string; roles?: string[] } } | null }));

vi.mock("next-auth", () => ({ getServerSession: async () => session.current }));

const { PATCH } = await import("./route");

function patch(id: string, body: unknown) {
  return PATCH(
    new NextRequest("http://localhost/api/users/x", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { id } }
  );
}

describe("trilha de mudança de permissão", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    session.current = { user: { id: "admin-de-teste", email: "admin@acerto.com.br", roles: ["ADMIN"] } };
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    const alvos = await prisma.user.findMany({ where: { email: { contains: "__test_" } }, select: { id: true } });
    await prisma.permissionChange.deleteMany({ where: { targetUserId: { in: alvos.map((a) => a.id) } } });
    await cleanupTestData();
  });

  it("registra qual papel foi removido, que era a informação que se perdia", async () => {
    const alvo = await createTestUser(["COMPRADOR", "APROVADOR"]);

    // Remove APROVADOR, mantém COMPRADOR.
    const res = await patch(alvo.id, { roles: ["COMPRADOR"] });
    expect(res.status).toBe(200);

    const registro = await prisma.permissionChange.findFirst({
      where: { targetUserId: alvo.id, kind: "PAPEL" },
      orderBy: { createdAt: "desc" },
    });

    expect(registro).not.toBeNull();
    expect(registro?.antes).toContain("APROVADOR");
    expect(registro?.depois).not.toContain("APROVADOR");
    expect(registro?.depois).toContain("COMPRADOR");
  });

  it("registra quem fez a mudança, não só o que mudou", async () => {
    const alvo = await createTestUser(["SOLICITANTE"]);

    await patch(alvo.id, { roles: ["SOLICITANTE", "CONTROLADORIA"] });

    const registro = await prisma.permissionChange.findFirst({
      where: { targetUserId: alvo.id, kind: "PAPEL" },
      orderBy: { createdAt: "desc" },
    });

    expect(registro?.actorEmail).toBe("admin@acerto.com.br");
    expect(registro?.createdAt).toBeInstanceOf(Date);
  });

  it("registra a desativação de acesso", async () => {
    const alvo = await createTestUser(["COMPRADOR"]);

    await patch(alvo.id, { active: false });

    const registro = await prisma.permissionChange.findFirst({
      where: { targetUserId: alvo.id, kind: "ACESSO_ATIVO" },
      orderBy: { createdAt: "desc" },
    });

    expect(registro?.antes).toBe("ativo");
    expect(registro?.depois).toBe("inativo");
  });

  it("não registra quando nada mudou, para o ruído não esconder o que importa", async () => {
    const alvo = await createTestUser(["COMPRADOR"]);

    await patch(alvo.id, { roles: ["COMPRADOR"] });

    const registros = await prisma.permissionChange.count({ where: { targetUserId: alvo.id, kind: "PAPEL" } });
    expect(registros).toBe(0);
  });

  it("a trilha é append-only: uma segunda mudança não sobrescreve a primeira", async () => {
    const alvo = await createTestUser(["SOLICITANTE"]);

    await patch(alvo.id, { roles: ["SOLICITANTE", "COMPRADOR"] });
    await patch(alvo.id, { roles: ["SOLICITANTE"] });

    const registros = await prisma.permissionChange.findMany({
      where: { targetUserId: alvo.id, kind: "PAPEL" },
      orderBy: { createdAt: "asc" },
    });

    expect(registros).toHaveLength(2);
    expect(registros[0].depois).toContain("COMPRADOR");
    expect(registros[1].antes).toContain("COMPRADOR");
    expect(registros[1].depois).not.toContain("COMPRADOR");
  });
});
