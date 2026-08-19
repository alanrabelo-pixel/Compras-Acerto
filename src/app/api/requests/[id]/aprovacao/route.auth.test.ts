import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createTestUser, createTestCostCenter, createTestRequest, cleanupTestData } from "@/test-helpers/fixtures";

/**
 * Regressão da falha de autorização na decisão de aprovação.
 *
 * Antes da correção, o PATCH só checava identidade dentro de
 * `if (personifiedBy)`. Omitindo esse campo, qualquer pessoa decidia qualquer
 * aprovação, em qualquer valor, sem papel e sem rastro (personifiedBy ficava
 * null, então o histórico atribuía a decisão ao aprovador legítimo).
 *
 * Por que este arquivo é separado de route.test.ts: os outros testes rodam com
 * LOCAL_BYPASS_AUTH="true" (vem do .env via vitest.config.ts), e é justamente
 * essa flag que faz requireRole pular a comparação com a sessão. Um teste de
 * autorização escrito naquele arquivo passaria sem exercer nada. Aqui a flag é
 * desligada e getServerSession é mockado, que é o caminho real de produção.
 */

const session = vi.hoisted(() => ({ current: null as { user: { id: string } } | null }));

vi.mock("next-auth", () => ({
  getServerSession: async () => session.current,
}));

const { PATCH } = await import("./route");

function patchRequest(body: unknown) {
  return new NextRequest("http://localhost/api/requests/x/aprovacao", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Monta uma solicitação em APROVACAO com uma aprovação pendente de Nível 2. */
async function scenario(estimatedValue: number) {
  const requester = await createTestUser([]);
  const approverManager = await createTestUser(["APROVADOR"]);
  const approver = await createTestUser(["APROVADOR"]);
  const intruder = await createTestUser(["SOLICITANTE"]);
  const costCenter = await createTestCostCenter();
  const request = await createTestRequest({
    requesterId: requester.id, approverManagerId: approverManager.id, costCenterId: costCenter.id,
    currentStage: "APROVACAO", estimatedValue,
  });
  const approval = await prisma.approval.create({
    data: { requestId: request.id, level: 2, approverId: approver.id, dueAt: new Date() },
  });
  return { request, approval, approver, intruder };
}

describe("PATCH /api/requests/[id]/aprovacao: autorização", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    session.current = null;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await cleanupTestData();
  });

  it("recusa quem não é o aprovador designado, mesmo omitindo personifiedBy", async () => {
    const { request, approval, intruder } = await scenario(400000);
    session.current = { user: { id: intruder.id } };

    const res = await PATCH(patchRequest({ approvalId: approval.id, decision: "APROVADO" }), {
      params: { id: request.id },
    });

    expect(res.status).toBe(403);

    // O ponto que mais importa: a decisão não pode ter sido gravada.
    const after = await prisma.approval.findUnique({ where: { id: approval.id } });
    expect(after?.decision).toBe("PENDENTE");
    const req = await prisma.purchaseRequest.findUnique({ where: { id: request.id } });
    expect(req?.currentStage).toBe("APROVACAO");
  });

  it("recusa quando não há sessão nenhuma", async () => {
    const { request, approval } = await scenario(400000);
    session.current = null;

    const res = await PATCH(patchRequest({ approvalId: approval.id, decision: "APROVADO" }), {
      params: { id: request.id },
    });

    expect(res.status).toBe(403);
    const after = await prisma.approval.findUnique({ where: { id: approval.id } });
    expect(after?.decision).toBe("PENDENTE");
  });

  it("permite que o próprio aprovador designado decida", async () => {
    const { request, approval, approver } = await scenario(400000);
    session.current = { user: { id: approver.id } };

    const res = await PATCH(patchRequest({ approvalId: approval.id, decision: "APROVADO" }), {
      params: { id: request.id },
    });

    expect(res.status).toBe(200);
    const after = await prisma.approval.findUnique({ where: { id: approval.id } });
    expect(after?.decision).toBe("APROVADO");
  });

  it("recusa decisão fora do enum, que antes avançava a solicitação como aprovada", async () => {
    const { request, approval, approver } = await scenario(400000);
    session.current = { user: { id: approver.id } };

    for (const decision of ["X", "aprovado", "", "PENDENTE"]) {
      const res = await PATCH(patchRequest({ approvalId: approval.id, decision }), {
        params: { id: request.id },
      });
      expect(res.status, `decision=${JSON.stringify(decision)}`).toBe(422);
    }

    const after = await prisma.approval.findUnique({ where: { id: approval.id } });
    expect(after?.decision).toBe("PENDENTE");
    const req = await prisma.purchaseRequest.findUnique({ where: { id: request.id } });
    expect(req?.currentStage).toBe("APROVACAO");
  });
});
