import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Regressão da exposição das rotas de API.
 *
 * O matcher do middleware cobria só páginas, então nenhuma rota de API passava
 * por ele e cada uma precisava se defender sozinha. Trinta das 57 não se
 * defendiam: dava para baixar qualquer anexo, exportar a base inteira em Excel
 * e criar solicitação sem autenticação nenhuma.
 *
 * Estes testes exercem o caminho real de produção, com LOCAL_BYPASS_AUTH
 * desligada. Com a flag ligada (o padrão em desenvolvimento) o middleware
 * libera tudo logo na primeira linha, então nada aqui seria exercido.
 */

const token = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));

vi.mock("next-auth/jwt", () => ({
  getToken: async () => token.current,
}));

const { middleware } = await import("./middleware");

function req(pathname: string) {
  return new NextRequest(`http://localhost${pathname}`);
}

describe("middleware: rotas de API", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    token.current = null;
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  const rotasQueEstavamAbertas = [
    "/api/requests",
    "/api/requests/abc123/aprovacao",
    "/api/attachments/abc123/file",
    "/api/dashboards/export",
    "/api/dashboards/export-pdf",
    "/api/contratos/import",
    "/api/contracts",
    "/api/users",
    "/api/tickets",
    "/api/search",
    "/api/suppliers",
    "/api/approval-levels",
  ];

  it("responde 401 sem sessão, em vez de deixar passar", async () => {
    for (const rota of rotasQueEstavamAbertas) {
      const res = await middleware(req(rota));
      expect(res.status, rota).toBe(401);
    }
  });

  it("responde em JSON, não redireciona para o login como as páginas", async () => {
    const res = await middleware(req("/api/requests"));

    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    // Um redirect devolveria HTML e o cliente quebraria com erro de parse.
    expect(res.headers.get("location")).toBeNull();
    await expect(res.json()).resolves.toEqual({ error: "Não autenticado." });
  });

  it("deixa passar quando há sessão", async () => {
    token.current = { sub: "user-1", roles: ["SOLICITANTE"] };

    for (const rota of rotasQueEstavamAbertas) {
      const res = await middleware(req(rota));
      expect(res.status, rota).toBe(200);
      expect(res.headers.get("location"), rota).toBeNull();
    }
  });

  it("exige apenas sessão, não canViewBoard: quem só é Solicitante precisa abrir solicitação", async () => {
    token.current = { sub: "user-1", roles: ["SOLICITANTE"], canViewBoard: false };

    const res = await middleware(req("/api/requests"));

    expect(res.status).toBe(200);
  });

  it("não exige sessão nas rotas que se autenticam sozinhas", async () => {
    const proprias = [
      "/api/auth/session",
      "/api/auth/callback/google",
      "/api/cron/contract-alerts",
      "/api/erp/purchase-requests",
      "/api/slack/events",
    ];

    for (const rota of proprias) {
      const res = await middleware(req(rota));
      expect(res.status, rota).toBe(200);
    }
  });

  it("libera tudo quando LOCAL_BYPASS_AUTH está ligada", async () => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "true");

    const res = await middleware(req("/api/dashboards/export"));

    expect(res.status).toBe(200);
  });
});

describe("middleware: páginas", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    token.current = null;
  });

  it("continua redirecionando página para o login, não devolve 401", async () => {
    const res = await middleware(req("/solicitacoes/nova"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("manda quem não tem canViewBoard para a tela de sem acesso", async () => {
    token.current = { sub: "user-1", canViewBoard: false };

    const res = await middleware(req("/dashboards"));

    expect(res.headers.get("location")).toContain("/sem-acesso");
  });

  it("exige papel ADMIN em /admin", async () => {
    token.current = { sub: "user-1", roles: ["SOLICITANTE"], canViewBoard: true };

    const res = await middleware(req("/admin/acessos"));

    expect(res.headers.get("location")).toContain("/sem-acesso");
  });
});
