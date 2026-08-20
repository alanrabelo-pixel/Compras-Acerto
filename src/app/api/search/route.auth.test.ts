import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createTestUser, createTestCostCenter, createTestRequest, cleanupTestData, TEST_PREFIX } from "@/test-helpers/fixtures";

/**
 * Regressão da leitura aberta em GET /api/search.
 *
 * Antes da guarda, a busca global (Command Palette, Ctrl+K) varria
 * Solicitações e Contratos para qualquer conta autenticada. O próprio
 * resultado já é o vazamento: código e descrição da compra, nome do
 * solicitante, etapa, e razão social/nome fantasia/CNPJ de fornecedor. Pior
 * que uma listagem, porque é consultável por termo: dá para pescar por nome de
 * fornecedor ou por palavra da descrição sem saber nenhum id.
 *
 * Arquivo separado porque a suíte roda com LOCAL_BYPASS_AUTH="true" (.env via
 * vitest.config.ts), e com a flag ligada exigirQuadro libera tudo.
 */

const session = vi.hoisted(() => ({
  current: null as { user: { id?: string; email?: string; roles?: string[]; canViewBoard?: boolean } } | null,
}));

vi.mock("next-auth", () => ({
  getServerSession: async () => session.current,
}));

const { GET } = await import("./route");

/** Mesmo formato de src/lib/acesso.test.ts: identidade vinda da sessão. */
function entrarComo(u: { id: string; email: string }, opcoes: { veQuadro?: boolean; papeis?: string[] } = {}) {
  session.current = {
    user: { id: u.id, email: u.email, roles: opcoes.papeis ?? [], canViewBoard: opcoes.veQuadro ?? false },
  };
}

function searchRequest(q: string) {
  return new NextRequest(`http://localhost/api/search?q=${encodeURIComponent(q)}`);
}

async function scenario() {
  const requester = await createTestUser(["SOLICITANTE"]);
  const approverManager = await createTestUser(["APROVADOR"]);
  const controladoria = await createTestUser(["CONTROLADORIA"]);
  const intruder = await createTestUser(["SOLICITANTE"]);
  await prisma.user.update({ where: { id: controladoria.id }, data: { canViewBoard: true } });
  const costCenter = await createTestCostCenter();
  const request = await createTestRequest({
    requesterId: requester.id,
    approverManagerId: approverManager.id,
    costCenterId: costCenter.id,
    currentStage: "COTACAO",
    estimatedValue: 90000,
  });
  return { request, requester, controladoria, intruder };
}

describe("GET /api/search: autorização", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    session.current = null;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await cleanupTestData();
  });

  it("recusa quem não tem acesso ao quadro e não devolve nenhum resultado", async () => {
    const { request, intruder } = await scenario();
    entrarComo(intruder, { papeis: ["SOLICITANTE"] });

    const res = await GET(searchRequest(TEST_PREFIX));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(false);
    expect(JSON.stringify(body)).not.toContain(request.code);
    expect(JSON.stringify(body)).not.toContain(request.shortDescription);
  });

  it("barra antes de olhar o termo, então nem o atalho do termo curto responde", async () => {
    const { intruder } = await scenario();
    entrarComo(intruder, { papeis: ["SOLICITANTE"] });

    // Termo com menos de 2 caracteres saía com 200 e lista vazia. Confirmar
    // que a guarda vem antes disso: quem não tem quadro nunca recebe 200 desta
    // rota, nem pelo caminho de saída rápida.
    const res = await GET(searchRequest("a"));

    expect(res.status).toBe(403);
  });

  it("recusa quem só é parte de uma solicitação, porque a busca é global", async () => {
    const { request, requester } = await scenario();
    entrarComo(requester, { papeis: ["SOLICITANTE"] });

    const res = await GET(searchRequest(TEST_PREFIX));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain(request.code);
  });

  it("recusa quando não há sessão nenhuma", async () => {
    await scenario();
    session.current = null;

    const res = await GET(searchRequest(TEST_PREFIX));

    expect(res.status).toBe(401);
  });

  it("permite quem tem acesso ao quadro e ainda encontra a solicitação", async () => {
    const { request, controladoria } = await scenario();
    entrarComo(controladoria, { papeis: ["CONTROLADORIA"], veQuadro: true });

    const res = await GET(searchRequest(request.code));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((r: { id: string }) => r.id === request.id)).toBe(true);
  });
});
