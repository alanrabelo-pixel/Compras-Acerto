import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createTestUser, cleanupTestData } from "@/test-helpers/fixtures";

/**
 * Autorização da configuração de alçadas.
 *
 * Antes da guarda, GET /api/approval-levels dizia a qualquer conta autenticada
 * exatamente quem aprova cada faixa de valor. Isso é controle interno: quem
 * quisesse empurrar uma compra saberia de antemão em quem insistir, e a tela
 * que edita esses aprovadores já é restrita a ADMIN pelo middleware. Por isso
 * exigirPapel(["ADMIN"]) e não exigirQuadro: o quadro inclui COMPRADOR,
 * APROVADOR e CONTROLADORIA, largo demais aqui.
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

describe("GET /api/approval-levels: autorização", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    session.current = null;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await cleanupTestData();
  });

  it("recusa quem só solicita", async () => {
    const solicitante = await createTestUser(["SOLICITANTE"]);
    await entrarComo(solicitante);

    const res = await GET();

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(false);
  });

  it("recusa quem tem quadro mas não é ADMIN: o quadro é largo demais aqui", async () => {
    for (const papel of ["COMPRADOR", "APROVADOR", "CONTROLADORIA"] as const) {
      const usuario = await createTestUser([papel]);
      await prisma.user.update({ where: { id: usuario.id }, data: { canViewBoard: true } });
      await entrarComo(usuario);

      const res = await GET();

      expect(res.status, `papel=${papel}`).toBe(403);
    }
  });

  it("permite ADMIN", async () => {
    const admin = await createTestUser(["ADMIN"]);
    await entrarComo(admin);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((n: { level: number }) => n.level)).toEqual([1, 2, 3]);
  });

  it("recusa quando não há sessão nenhuma", async () => {
    session.current = null;

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it("recusa ADMIN desativado, que aparece como sessão sem id e sem papéis", async () => {
    // É assim que a revogação chega até aqui: o callback session() de
    // src/lib/auth.ts zera o id e os papéis de quem foi desativado.
    session.current = { user: { email: "admin-desativado@acerto.com.br", roles: [], canViewBoard: false } };

    const res = await GET();

    expect(res.status).toBe(401);
  });
});
