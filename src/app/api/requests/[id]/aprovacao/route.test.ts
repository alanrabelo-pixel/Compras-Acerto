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

  it("cria a aprovação na alçada correta depois da declaração sem conflito (Nível 1, 1 aprovador)", async () => {
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
    expect(data.approvals).toHaveLength(1);
    expect(data.approvals[0].level).toBe(1);
    expect(data.approvals[0].approverId).toBe(approver.id);
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

  it("aprova e avança para Pedido de Compra quando não precisa de contrato (Nível 1)", async () => {
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
    const { approvals } = await created.json();

    const res = await PATCH(jsonRequest({ approvalId: approvals[0].id, decision: "APROVADO", justification: "ok" }, "PATCH"), { params: { id: request.id } });
    const data = await res.json();

    expect(data.currentStage).toBe("PEDIDO_COMPRA");
  });

  it("bloqueia personificação acima do Nível 1 (R$ 50 mil)", async () => {
    const requester = await createTestUser([]);
    const approverManager = await createTestUser(["APROVADOR"]);
    const approverA = await createTestUser(["APROVADOR"]);
    const approverB = await createTestUser(["APROVADOR"]);
    const buyer = await createTestUser(["COMPRADOR"]);
    const costCenter = await createTestCostCenter();
    // R$ 100.000 -> nível 2, personificação não permitida (e exige 2 aprovadores).
    const request = await createTestRequest({
      requesterId: requester.id, approverManagerId: approverManager.id, costCenterId: costCenter.id,
      currentStage: "APROVACAO", estimatedValue: 100000,
    });
    await declareNoConflict(request.id, requester.id);
    const created = await POST(jsonRequest({ approverIds: [approverA.id, approverB.id] }), { params: { id: request.id } });
    const { approvals } = await created.json();

    const res = await PATCH(
      jsonRequest({ approvalId: approvals[0].id, decision: "APROVADO", justification: "urgente", personifiedBy: buyer.id }, "PATCH"),
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
    const { approvals } = await created.json();

    const res = await PATCH(
      jsonRequest({ approvalId: approvals[0].id, decision: "APROVADO", justification: "Aprovador ausente hoje.", personifiedBy: buyer.id }, "PATCH"),
      { params: { id: request.id } }
    );

    expect(res.status).toBe(200);
    const stored = await prisma.approval.findUnique({ where: { id: approvals[0].id } });
    expect(stored?.personifiedBy).toBe(buyer.id);
  });

  it("atribui automaticamente o aprovador configurado para a alçada, sem precisar de escolha manual", async () => {
    const requester = await createTestUser([]);
    const approverManager = await createTestUser(["APROVADOR"]);
    const levelDefault = await createTestUser(["APROVADOR"]);
    const costCenter = await createTestCostCenter();
    // R$ 30.000 -> nível 1.
    const request = await createTestRequest({
      requesterId: requester.id, approverManagerId: approverManager.id, costCenterId: costCenter.id,
      currentStage: "APROVACAO", estimatedValue: 30000,
    });
    await declareNoConflict(request.id, requester.id);
    await prisma.approvalLevelApprover.create({ data: { level: 1, userId: levelDefault.id } });

    try {
      const res = await POST(jsonRequest({}), { params: { id: request.id } });
      const { approvals } = await res.json();

      expect(res.status).toBe(201);
      expect(approvals).toHaveLength(1);
      expect(approvals[0].approverId).toBe(levelDefault.id);
    } finally {
      // Config global de alçada (não escopada por TEST_PREFIX): remove para
      // não vazar entre este e outros arquivos de teste rodando em paralelo.
      await prisma.approvalLevelApprover.deleteMany({ where: { level: 1, userId: levelDefault.id } });
    }
  });

  it("permite que um ADMIN personifique acima do Nível 1, sem o teto do comprador", async () => {
    const requester = await createTestUser([]);
    const approverManager = await createTestUser(["APROVADOR"]);
    const approverA = await createTestUser(["APROVADOR"]);
    const approverB = await createTestUser(["APROVADOR"]);
    const admin = await createTestUser(["ADMIN"]);
    const costCenter = await createTestCostCenter();
    // R$ 100.000 -> nível 2, teto normal bloquearia um comprador comum.
    const request = await createTestRequest({
      requesterId: requester.id, approverManagerId: approverManager.id, costCenterId: costCenter.id,
      currentStage: "APROVACAO", estimatedValue: 100000,
    });
    await declareNoConflict(request.id, requester.id);
    const created = await POST(jsonRequest({ approverIds: [approverA.id, approverB.id] }), { params: { id: request.id } });
    const { approvals } = await created.json();

    const res = await PATCH(
      jsonRequest({ approvalId: approvals[0].id, decision: "APROVADO", justification: "personificação administrativa", personifiedBy: admin.id }, "PATCH"),
      { params: { id: request.id } }
    );

    expect(res.status).toBe(200);
    const stored = await prisma.approval.findUnique({ where: { id: approvals[0].id } });
    expect(stored?.personifiedBy).toBe(admin.id);
  });

  describe("dupla checagem nos Níveis 2 e 3", () => {
    it("exige 2 aprovadores distintos ao criar a aprovação do Nível 2", async () => {
      const requester = await createTestUser([]);
      const approverManager = await createTestUser(["APROVADOR"]);
      const approver = await createTestUser(["APROVADOR"]);
      const costCenter = await createTestCostCenter();
      const request = await createTestRequest({
        requesterId: requester.id, approverManagerId: approverManager.id, costCenterId: costCenter.id,
        currentStage: "APROVACAO", estimatedValue: 100000,
      });
      await declareNoConflict(request.id, requester.id);

      const semAprovadores = await POST(jsonRequest({}), { params: { id: request.id } });
      expect(semAprovadores.status).toBe(422);

      const mesmaPessoaDuasVezes = await POST(jsonRequest({ approverIds: [approver.id, approver.id] }), { params: { id: request.id } });
      const data = await mesmaPessoaDuasVezes.json();
      expect(mesmaPessoaDuasVezes.status).toBe(422);
      expect(data.error).toMatch(/pessoas diferentes/);
    });

    it("só avança para Pedido de Compra depois que os DOIS aprovadores decidirem", async () => {
      const requester = await createTestUser([]);
      const approverManager = await createTestUser(["APROVADOR"]);
      const approverA = await createTestUser(["APROVADOR"]);
      const approverB = await createTestUser(["APROVADOR"]);
      const costCenter = await createTestCostCenter();
      const request = await createTestRequest({
        requesterId: requester.id, approverManagerId: approverManager.id, costCenterId: costCenter.id,
        currentStage: "APROVACAO", estimatedValue: 100000, needsContract: false,
      });
      await declareNoConflict(request.id, requester.id);
      const created = await POST(jsonRequest({ approverIds: [approverA.id, approverB.id] }), { params: { id: request.id } });
      const { approvals } = await created.json();
      expect(approvals).toHaveLength(2);

      const primeiraDecisao = await PATCH(
        jsonRequest({ approvalId: approvals[0].id, decision: "APROVADO", justification: "ok" }, "PATCH"),
        { params: { id: request.id } }
      );
      const primeiroDado = await primeiraDecisao.json();
      expect(primeiroDado.waitingForOtherApprovers).toBe(true);

      const aindaEmAprovacao = await prisma.purchaseRequest.findUnique({ where: { id: request.id } });
      expect(aindaEmAprovacao?.currentStage).toBe("APROVACAO");

      const segundaDecisao = await PATCH(
        jsonRequest({ approvalId: approvals[1].id, decision: "APROVADO", justification: "ok" }, "PATCH"),
        { params: { id: request.id } }
      );
      const segundoDado = await segundaDecisao.json();
      expect(segundoDado.currentStage).toBe("PEDIDO_COMPRA");
    });

    it("uma única reprovação já cancela, mesmo com o outro aprovador ainda pendente", async () => {
      const requester = await createTestUser([]);
      const approverManager = await createTestUser(["APROVADOR"]);
      const approverA = await createTestUser(["APROVADOR"]);
      const approverB = await createTestUser(["APROVADOR"]);
      const costCenter = await createTestCostCenter();
      const request = await createTestRequest({
        requesterId: requester.id, approverManagerId: approverManager.id, costCenterId: costCenter.id,
        currentStage: "APROVACAO", estimatedValue: 600000,
      });
      await declareNoConflict(request.id, requester.id);
      const created = await POST(jsonRequest({ approverIds: [approverA.id, approverB.id] }), { params: { id: request.id } });
      const { approvals } = await created.json();

      const res = await PATCH(
        jsonRequest({ approvalId: approvals[0].id, decision: "REPROVADO", justification: "não aprovado" }, "PATCH"),
        { params: { id: request.id } }
      );
      expect(res.status).toBe(200);

      const updated = await prisma.purchaseRequest.findUnique({ where: { id: request.id } });
      expect(updated?.currentStage).toBe("CANCELADO");
      expect(updated?.status).toBe("CANCELADO");
    });
  });
});
