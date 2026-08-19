import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createTestUser, createTestCostCenter, createTestRequest, cleanupTestData } from "@/test-helpers/fixtures";

/**
 * A cadeia de exploração encontrada na auditoria de 19/08/2026, em teste.
 *
 * Os quatro achados críticos não eram independentes. Encadeados, permitiam que
 * alguém sem papel nenhum levasse uma compra de R$ 500 mil da criação até a
 * aprovação, sem deixar rastro de que outra pessoa decidiu:
 *
 *   1. POST /api/requests                      cria a solicitação
 *   2. POST /api/requests/[id]/conflito-interesse  declara "sem conflito"
 *   3. POST /api/requests/[id]/aprovacao       cria os registros de aprovação
 *   4. PATCH /api/requests/[id]/aprovacao      decide, sem personifiedBy
 *
 * Hoje a cadeia é cortada em duas camadas independentes, e este arquivo
 * verifica as duas: os passos 1 a 3 pelo middleware, que passou a exigir sessão
 * em /api/*, e o passo 4 pela própria rota, que passou a exigir que quem chama
 * seja o aprovador designado.
 *
 * Manter a redundância é proposital. Se alguém remover /api/:path* do matcher
 * do middleware no futuro, o passo 4 continua bloqueado e este teste aponta
 * exatamente qual camada caiu.
 */

const session = vi.hoisted(() => ({ current: null as { user: { id: string } } | null }));
const token = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));

vi.mock("next-auth", () => ({ getServerSession: async () => session.current }));
vi.mock("next-auth/jwt", () => ({ getToken: async () => token.current }));

const { middleware } = await import("@/middleware");
const { PATCH } = await import("./route");

function get(pathname: string) {
  return new NextRequest(`http://localhost${pathname}`, { method: "POST" });
}

describe("cadeia de exploração: aprovar R$ 500 mil sem papel nenhum", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    session.current = null;
    token.current = null;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await cleanupTestData();
  });

  it("passo 1: criar a solicitação exige sessão", async () => {
    const res = await middleware(get("/api/requests"));
    expect(res.status).toBe(401);
  });

  it("passo 2: declarar ausência de conflito exige sessão", async () => {
    const res = await middleware(get("/api/requests/abc123/conflito-interesse"));
    expect(res.status).toBe(401);
  });

  it("passo 3: criar os registros de aprovação exige sessão", async () => {
    const res = await middleware(get("/api/requests/abc123/aprovacao"));
    expect(res.status).toBe(401);
  });

  it("passo 4: decidir exige ser o aprovador designado, mesmo com sessão válida de outra pessoa", async () => {
    const requester = await createTestUser([]);
    const approverManager = await createTestUser(["APROVADOR"]);
    const approver = await createTestUser(["APROVADOR"]);
    const intruso = await createTestUser(["SOLICITANTE"]);
    const costCenter = await createTestCostCenter();
    const request = await createTestRequest({
      requesterId: requester.id, approverManagerId: approverManager.id, costCenterId: costCenter.id,
      currentStage: "APROVACAO", estimatedValue: 500000,
    });
    const approval = await prisma.approval.create({
      data: { requestId: request.id, level: 3, approverId: approver.id, dueAt: new Date() },
    });

    // O intruso passou pelo middleware (tem sessão), mas não é o aprovador.
    token.current = { sub: intruso.id };
    session.current = { user: { id: intruso.id } };

    const res = await PATCH(
      new NextRequest("http://localhost/api/requests/x/aprovacao", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Omitir personifiedBy era exatamente o que pulava toda a checagem.
        body: JSON.stringify({ approvalId: approval.id, decision: "APROVADO" }),
      }),
      { params: { id: request.id } }
    );

    expect(res.status).toBe(403);

    // O que de fato importa: a compra de R$ 500 mil não avançou.
    const depois = await prisma.approval.findUnique({ where: { id: approval.id } });
    expect(depois?.decision).toBe("PENDENTE");
    const req = await prisma.purchaseRequest.findUnique({ where: { id: request.id } });
    expect(req?.currentStage).toBe("APROVACAO");
    expect(req?.status).not.toBe("CONCLUIDO");
  });
});
