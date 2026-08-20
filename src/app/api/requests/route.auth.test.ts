import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createTestUser, createTestCostCenter, createTestRequest, cleanupTestData } from "@/test-helpers/fixtures";

/**
 * Regressão da leitura aberta em GET /api/requests.
 *
 * Antes da guarda, a rota devolvia a carteira inteira de solicitações da
 * empresa para qualquer conta autenticada: código, descrição, valor estimado,
 * centro de custo, solicitante e gestor aprovador de TODA a base. O middleware
 * só exige sessão @acerto.com.br em /api/*, então quem não tem acesso ao
 * quadro não enxerga a listagem na tela mas conseguia a mesma coisa chamando a
 * rota direto.
 *
 * Arquivo separado de qualquer route.test.ts pelo motivo de sempre nesta base:
 * a suíte roda com LOCAL_BYPASS_AUTH="true" (vem do .env via vitest.config.ts)
 * e essa flag faz exigirQuadro liberar tudo. Aqui a flag é desligada e
 * getServerSession é mockado, que é o caminho real de produção.
 */

const session = vi.hoisted(() => ({
  current: null as { user: { id?: string; email?: string; roles?: string[]; canViewBoard?: boolean } } | null,
}));

vi.mock("next-auth", () => ({
  getServerSession: async () => session.current,
}));

const { GET } = await import("./route");

/**
 * Mesmo formato de src/lib/acesso.test.ts: a identidade vem das reivindicações
 * da sessão (id, papéis, canViewBoard), que é o que o callback session() de
 * src/lib/auth.ts grava a partir do banco. Sem id é como uma pessoa desativada
 * aparece.
 */
function entrarComo(u: { id: string; email: string }, opcoes: { veQuadro?: boolean; papeis?: string[] } = {}) {
  session.current = {
    user: { id: u.id, email: u.email, roles: opcoes.papeis ?? [], canViewBoard: opcoes.veQuadro ?? false },
  };
}

function getRequest(query = "") {
  return new NextRequest(`http://localhost/api/requests${query}`);
}

async function scenario() {
  const requester = await createTestUser(["SOLICITANTE"]);
  const approverManager = await createTestUser(["APROVADOR"]);
  const comprador = await createTestUser(["COMPRADOR"]);
  // Só SOLICITANTE: é exatamente quem a tela /solicitacoes não deixa entrar.
  const intruder = await createTestUser(["SOLICITANTE"]);
  // A coluna é o que um ADMIN marca em /admin/acessos; deixá-la coerente com a
  // reivindicação da sessão evita testar um estado que não existiria.
  await prisma.user.update({ where: { id: comprador.id }, data: { canViewBoard: true } });
  const costCenter = await createTestCostCenter();
  const request = await createTestRequest({
    requesterId: requester.id,
    approverManagerId: approverManager.id,
    costCenterId: costCenter.id,
    currentStage: "TRIAGEM",
    estimatedValue: 250000,
  });
  return { request, requester, comprador, intruder };
}

describe("GET /api/requests: autorização", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    session.current = null;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await cleanupTestData();
  });

  it("recusa quem não tem acesso ao quadro, sem devolver nenhuma solicitação", async () => {
    const { request, intruder } = await scenario();
    entrarComo(intruder, { papeis: ["SOLICITANTE"] });

    const res = await GET(getRequest());

    expect(res.status).toBe(403);
    const body = await res.json();
    // O ponto que mais importa: o corpo do erro não pode ser a listagem.
    expect(Array.isArray(body)).toBe(false);
    expect(JSON.stringify(body)).not.toContain(request.code);
  });

  it("recusa também o próprio solicitante da vez, porque a rota lista a base toda", async () => {
    const { request, requester } = await scenario();
    entrarComo(requester, { papeis: ["SOLICITANTE"] });

    const res = await GET(getRequest());

    // Ele é parte NAQUELA solicitação, mas esta rota não tem recorte por
    // solicitante: devolver 200 aqui entregaria a carteira inteira. As
    // próprias solicitações dele continuam em /solicitacoes/minhas, que
    // consulta o Prisma direto no servidor e não passa por esta rota.
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain(request.code);
  });

  it("aceita quem tem papel de comprador mesmo com a coluna canViewBoard desligada", async () => {
    const { request, comprador } = await scenario();
    // Este teste já afirmou o contrário, contra uma versão anterior da
    // primitiva que olhava só a coluna. A regra mudou de propósito, depois de
    // medir o banco: a coluna é recalculada a partir dos papéis em
    // /admin/acessos, mas 11 dos 22 usuários ativos têm papel de quadro com a
    // coluna em false, herdada do seed, entre eles a Controladoria. Barrar por
    // isso seria punir dado velho e não decisão de acesso. Ver o comentário de
    // atorDaSessao em src/lib/acesso.ts.
    entrarComo(comprador, { papeis: ["COMPRADOR"], veQuadro: false });

    const res = await GET(getRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(JSON.stringify(body)).toContain(request.code);
  });

  it("recusa quando não há sessão nenhuma", async () => {
    await scenario();
    session.current = null;

    const res = await GET(getRequest());

    expect(res.status).toBe(401);
  });

  it("recusa a sessão sem id, que é como uma pessoa desativada continua chegando", async () => {
    const { comprador } = await scenario();
    // Cookie ainda válido de quem foi desativado: o callback session() zera o
    // id, e é isso que faz a revogação valer na hora para as rotas de API.
    session.current = { user: { email: comprador.email, roles: ["COMPRADOR"], canViewBoard: true } };

    const res = await GET(getRequest());

    expect(res.status).toBe(401);
  });

  it("permite quem tem acesso ao quadro e ainda devolve a listagem", async () => {
    const { request, comprador } = await scenario();
    entrarComo(comprador, { papeis: ["COMPRADOR"], veQuadro: true });

    const res = await GET(getRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((r: { code: string }) => r.code === request.code)).toBe(true);
  });

  it("preserva o filtro por etapa para quem tem quadro", async () => {
    const { request, comprador } = await scenario();
    entrarComo(comprador, { papeis: ["COMPRADOR"], veQuadro: true });

    const res = await GET(getRequest("?stage=TRIAGEM"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.some((r: { code: string }) => r.code === request.code)).toBe(true);
    expect(body.every((r: { currentStage: string }) => r.currentStage === "TRIAGEM")).toBe(true);
  });
});
