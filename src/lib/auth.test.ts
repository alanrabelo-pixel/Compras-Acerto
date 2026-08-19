import { describe, it, expect, afterAll } from "vitest";
import type { JWT } from "next-auth/jwt";
import type { Session } from "next-auth";
import { prisma } from "@/lib/db";
import { authOptions } from "./auth";
import { createTestUser, cleanupTestData } from "@/test-helpers/fixtures";

/**
 * Regressão da revogação de acesso.
 *
 * `active` era checado só no callback signIn, então desativar alguém em
 * /admin/acessos bloqueava logins novos mas não encerrava a sessão em curso. E
 * quando o usuário sumia do banco, o `if (dbUser)` do callback jwt deixava as
 * reivindicações antigas intactas no token: papéis de quem já não deveria ter
 * acesso continuavam valendo.
 *
 * Somado ao maxAge padrão do NextAuth (30 dias), um desligamento mantinha
 * acesso completo por semanas.
 */

const jwtCallback = authOptions.callbacks!.jwt!;
const sessionCallback = authOptions.callbacks!.session!;

// O contrato dos callbacks do NextAuth traz muitos campos que não importam
// aqui; os casts mantêm os testes legíveis sem construir o objeto inteiro.
function chamarJwt(token: Partial<JWT>) {
  return jwtCallback({ token } as Parameters<typeof jwtCallback>[0]) as Promise<JWT>;
}
function chamarSession(email: string, token: Partial<JWT> = {}) {
  return sessionCallback({
    session: { user: { email } },
    token,
  } as unknown as Parameters<typeof sessionCallback>[0]) as Promise<Session>;
}

describe("callback jwt", () => {
  afterAll(async () => {
    await cleanupTestData();
  });

  it("carrega papéis e acesso ao quadro de quem está ativo", async () => {
    const user = await createTestUser(["COMPRADOR"]);
    await prisma.user.update({ where: { id: user.id }, data: { canViewBoard: true } });

    const token = await chamarJwt({ email: user.email });

    expect(token.userId).toBe(user.id);
    expect(token.roles).toContain("COMPRADOR");
    expect(token.canViewBoard).toBe(true);
    expect(token.desativado).toBe(false);
  });

  it("zera as reivindicações de quem foi desativado, em vez de mantê-las", async () => {
    const user = await createTestUser(["ADMIN"]);
    await prisma.user.update({ where: { id: user.id }, data: { canViewBoard: true } });
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });

    // Simula o cookie já emitido, com os privilégios antigos dentro.
    const token = await chamarJwt({
      email: user.email,
      userId: user.id,
      roles: ["ADMIN"],
      canViewBoard: true,
    });

    expect(token.desativado).toBe(true);
    expect(token.roles).toEqual([]);
    expect(token.canViewBoard).toBe(false);
    expect(token.userId).toBeUndefined();
  });

  it("zera as reivindicações quando o usuário não existe mais no banco", async () => {
    const token = await chamarJwt({
      email: "__test_removido__@acerto.com.br",
      userId: "id-antigo",
      roles: ["ADMIN"],
      canViewBoard: true,
    });

    expect(token.desativado).toBe(true);
    expect(token.roles).toEqual([]);
    expect(token.canViewBoard).toBe(false);
  });

  it("reflete a remoção de papel na renovação seguinte do token", async () => {
    const user = await createTestUser(["ADMIN"]);

    await prisma.userRole.deleteMany({ where: { userId: user.id, role: "ADMIN" } });
    const token = await chamarJwt({ email: user.email, roles: ["ADMIN"] });

    expect(token.roles).not.toContain("ADMIN");
  });
});

describe("callback session", () => {
  afterAll(async () => {
    await cleanupTestData();
  });

  it("não devolve id para quem foi desativado, então requireRole recusa", async () => {
    const user = await createTestUser(["COMPRADOR"]);
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });

    const session = await chamarSession(user.email, { canViewBoard: true });
    const u = session.user as { id?: string; roles?: string[]; canViewBoard?: boolean };

    expect(u.id).toBeUndefined();
    expect(u.roles).toEqual([]);
    expect(u.canViewBoard).toBe(false);
  });

  it("não cai para o canViewBoard velho do token quando o acesso foi revogado", async () => {
    const user = await createTestUser(["SOLICITANTE"]);
    await prisma.user.update({ where: { id: user.id }, data: { canViewBoard: false } });

    // O cookie ainda carrega canViewBoard true, de quando a pessoa tinha acesso.
    const session = await chamarSession(user.email, { canViewBoard: true });
    const u = session.user as { canViewBoard?: boolean };

    expect(u.canViewBoard).toBe(false);
  });

  it("entrega os dados de quem está ativo", async () => {
    const user = await createTestUser(["APROVADOR"]);
    await prisma.user.update({ where: { id: user.id }, data: { canViewBoard: true } });

    const session = await chamarSession(user.email);
    const u = session.user as { id?: string; roles?: string[]; canViewBoard?: boolean };

    expect(u.id).toBe(user.id);
    expect(u.roles).toContain("APROVADOR");
    expect(u.canViewBoard).toBe(true);
  });
});

describe("validade da sessão", () => {
  it("expira em 8 horas, não nos 30 dias padrão do NextAuth", () => {
    expect(authOptions.session?.maxAge).toBe(8 * 60 * 60);
  });
});
