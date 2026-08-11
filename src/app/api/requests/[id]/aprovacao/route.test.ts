import { describe, it, expect, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { POST, PATCH } from "./route";
import { prisma } from "@/lib/db";
import { createTestUser, createTestCostCenter, createTestRequest, cleanupTestData } from "@/test-helpers/fixtures";

function jsonRequest(body: unknown, method: "POST" | "PATCH" = "POST") {
  return new NextRequest("http://localhost/api/requests/x/aprovacao", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function declareNoConflict(requestId: string, declaredBy: string) {
  await prisma.conflictOfInterestDeclaration.create({
    data: { requestId, declaredBy, hasConflict: false },
  });
}

describe("POST/PATCH /api/requests/[id]/aprovacao", () => {
  afterAll(async () => {
    await cleanupTestData();
  });

  it("bloqueia a criação da aprovação sem declaração de conflito de interesse", async () => {
    const requester = await createTestUser([]);
    const approverManager = await createTestUser(["APROVADOR"]);
    const approver = await createTestUser(["APROVADOR"]);
    const costCenter = await createTestCostCenter();
    const request = await createTestRequest({
      requesterId: requester.id, approverManagerId: approverManager.id, costCenterId: costCenter.id,
      currentStage: "APROVACAO", estimatedValue: 30000,
    });

    const res = await POST(jsonRequest({ approverId: approver.id }), { params: { id: request.id } });

    expect(res.status).toBe(422);
    const approvals = await prisma.approval.findMany({ where: { requestId: request.id } });
    expect(approvals).toHaveLength(0);
  });

  it("cria a aprovação na alçada correta depois da declaração sem conflito", async () => {
    const requester = await createTestUser([]);
    const approverManager = await createTestUser(["APROVADOR"]);
    const approver = await createTestUser(["APROVADOR"]);
    const costCenter = await createTestCostCenter();
    // R$ 30.000 -> nível 1 (até 50k).
    const request = await createTestRequest({
      requesterId: requester.id, approverManagerId: approverManager.id, costCenterId: costCenter.id,
      currentStage: "APROVACAO", estimatedValue: 30000,
    });
    await declareNoConflict(request.id, requester.id);

    const res = await POST(jsonRequest({ approverId: approver.id }), { params: { id: request.id } });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.level).toBe(1);
    expect(data.approverId).toBe(approver.id);
  });

  it("rejeita a criação quando o aprovador indicado não tem papel Aprovador", async () => {
    const requester = await createTestUser([]);
    const approverManager = await createTestUser(["APROVADOR"]);
    const notApprover = await createTestUser(["JURIDICO"]);
    const costCenter = await createTestCostCenter();
    const request = await createTestRequest({
      requesterId: requester.id, approverManagerId: approverManager.id, costCenterId: costCenter.id,
      currentStage: "APROVACAO", estimatedValue: 30000,
    });
    await declareNoConflict(request.id, requester.id);

    const res = await POST(jsonRequest({ approverId: notApprover.id }), { params: { id: request.id } });

    expect(res.status).toBe(403);
  });

  it("aprova e avança para Pedido de Compra quando não precisa de contrato", async () => {
    const requester = await createTestUser([]);
    const approverManager = await createTestUser(["APROVADOR"]);
    const approver = await createTestUser(["APROVADOR"]);
    const costCenter = await createTestCostCenter();
    const request = await createTestRequest({
      requesterId: requester.id, approverManagerId: approverManager.id, costCenterId: costCenter.id,
      currentStage: "APROVACAO", estimatedValue: 30000, needsContract: false,
    });
    await declareNoConflict(request.id, requester.id);
    const created = await POST(jsonRequest({ approverId: approver.id }), { params: { id: request.id } });
    const approval = await created.json();

    const res = await PATCH(jsonRequest({ approvalId: approval.id, decision: "APROVADO", justification: "ok" }, "PATCH"), { params: { id: request.id } });
    const data = await res.json();

    expect(data.currentStage).toBe("PEDIDO_COMPRA");
  });

  it("bloqueia personificação acima do Nível 1 (R$ 50 mil)", async () => {
    const requester = await createTestUser([]);
    const approverManager = await createTestUser(["APROVADOR"]);
    const approver = await createTestUser(["APROVADOR"]);
    const buyer = await createTestUser(["COMPRADOR"]);
    const costCenter = await createTestCostCenter();
    // R$ 100.000 -> nível 2, personificação não permitida.
    const request = await createTestRequest({
      requesterId: requester.id, approverManagerId: approverManager.id, costCenterId: costCenter.id,
      currentStage: "APROVACAO", estimatedValue: 100000,
    });
    await declareNoConflict(request.id, requester.id);
    const created = await POST(jsonRequest({ approverId: approver.id }), { params: { id: request.id } });
    const approval = await created.json();

    const res = await PATCH(
      jsonRequest({ approvalId: approval.id, decision: "APROVADO", justification: "urgente", personifiedBy: buyer.id }, "PATCH"),
      { params: { id: request.id } }
    );
    const data = await res.json();

    expect(res.status).toBe(422);
    expect(data.error).toMatch(/Nível 1/);
  });

  it("permite personificação dentro do Nível 1 com justificativa e comprador válido", async () => {
    const requester = await createTestUser([]);
    const approverManager = await createTestUser(["APROVADOR"]);
    const approver = await createTestUser(["APROVADOR"]);
    const buyer = await createTestUser(["COMPRADOR"]);
    const costCenter = await createTestCostCenter();
    const request = await createTestRequest({
      requesterId: requester.id, approverManagerId: approverManager.id, costCenterId: costCenter.id,
      currentStage: "APROVACAO", estimatedValue: 20000, needsContract: false,
    });
    await declareNoConflict(request.id, requester.id);
    const created = await POST(jsonRequest({ approverId: approver.id }), { params: { id: request.id } });
    const approval = await created.json();

    const res = await PATCH(
      jsonRequest({ approvalId: approval.id, decision: "APROVADO", justification: "Aprovador ausente hoje.", personifiedBy: buyer.id }, "PATCH"),
      { params: { id: request.id } }
    );

    expect(res.status).toBe(200);
    const stored = await prisma.approval.findUnique({ where: { id: approval.id } });
    expect(stored?.personifiedBy).toBe(buyer.id);
  });
});
