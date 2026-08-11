import { describe, it, expect, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { PATCH } from "./route";
import { prisma } from "@/lib/db";
import { createTestUser, createTestCostCenter, createTestRequest, cleanupTestData } from "@/test-helpers/fixtures";

function jsonRequest(body: unknown) {
  return new NextRequest("http://localhost/api/requests/x/aprovacao-gestor", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/requests/[id]/aprovacao-gestor", () => {
  afterAll(async () => {
    await cleanupTestData();
  });

  it("rejeita quando a solicitação não está na etapa Aprovação do Gestor", async () => {
    const requester = await createTestUser([]);
    const manager = await createTestUser(["APROVADOR"]);
    const costCenter = await createTestCostCenter();
    const request = await createTestRequest({
      requesterId: requester.id, approverManagerId: manager.id, costCenterId: costCenter.id,
      currentStage: "TRIAGEM",
    });

    const res = await PATCH(
      jsonRequest({ actorId: manager.id, decision: "APROVADO" }),
      { params: { id: request.id } }
    );

    expect(res.status).toBe(409);
  });

  it("rejeita quando quem decide não tem papel Aprovador", async () => {
    const requester = await createTestUser([]);
    const manager = await createTestUser(["APROVADOR"]);
    const notApprover = await createTestUser([]);
    const costCenter = await createTestCostCenter();
    const request = await createTestRequest({
      requesterId: requester.id, approverManagerId: manager.id, costCenterId: costCenter.id,
      currentStage: "APROVACAO_GESTOR",
    });

    const res = await PATCH(
      jsonRequest({ actorId: notApprover.id, decision: "APROVADO" }),
      { params: { id: request.id } }
    );

    expect(res.status).toBe(403);
  });

  it("avança para Triagem quando o gestor aprova", async () => {
    const requester = await createTestUser([]);
    const manager = await createTestUser(["APROVADOR"]);
    const costCenter = await createTestCostCenter();
    const request = await createTestRequest({
      requesterId: requester.id, approverManagerId: manager.id, costCenterId: costCenter.id,
      currentStage: "APROVACAO_GESTOR",
    });

    const res = await PATCH(
      jsonRequest({ actorId: manager.id, decision: "APROVADO" }),
      { params: { id: request.id } }
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.currentStage).toBe("TRIAGEM");
    expect(data.status).toBe("ABERTO");
    expect(data.managerApprovalDecision).toBe("APROVADO");
    expect(data.managerApprovalActorId).toBe(manager.id);
  });

  it("exige justificativa e cancela a solicitação quando o gestor reprova", async () => {
    const requester = await createTestUser([]);
    const manager = await createTestUser(["APROVADOR"]);
    const costCenter = await createTestCostCenter();
    const request = await createTestRequest({
      requesterId: requester.id, approverManagerId: manager.id, costCenterId: costCenter.id,
      currentStage: "APROVACAO_GESTOR",
    });

    const semJustificativa = await PATCH(
      jsonRequest({ actorId: manager.id, decision: "REPROVADO" }),
      { params: { id: request.id } }
    );
    expect(semJustificativa.status).toBe(422);

    const res = await PATCH(
      jsonRequest({ actorId: manager.id, decision: "REPROVADO", justification: "Fora do orçamento do centro de custo." }),
      { params: { id: request.id } }
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.currentStage).toBe("CANCELADO");
    expect(data.status).toBe("CANCELADO");
    expect(data.cancelReason).toBe("Fora do orçamento do centro de custo.");
  });
});
