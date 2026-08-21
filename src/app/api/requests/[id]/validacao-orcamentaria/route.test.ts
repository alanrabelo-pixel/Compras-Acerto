import { describe, it, expect, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { PATCH } from "./route";
import { prisma } from "@/lib/db";
import { createTestUser, createTestCostCenter, createTestRequest, cleanupTestData } from "@/test-helpers/fixtures";

/**
 * Testes de integração: a rota decide se uma solicitação segue direto para
 * Cotação/Due Diligence ou entra no workflow de exceção orçamentária por
 * alçada. É dinheiro real sendo liberado ou bloqueado; até esta suite não
 * havia nenhuma verificação automatizada além das funções puras de
 * workflow.ts (que não garantem que a ROTA as aplica corretamente).
 */
function patchRequest(body: unknown) {
  return new NextRequest("http://localhost/api/requests/x/validacao-orcamentaria", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/requests/[id]/validacao-orcamentaria", () => {
  afterAll(async () => {
    await cleanupTestData();
  });

  it("avança direto para Cotação quando há orçamento e o ator é Comprador", async () => {
    const requester = await createTestUser([]);
    const buyer = await createTestUser(["COMPRADOR"]);
    const approver = await createTestUser(["APROVADOR"]);
    const costCenter = await createTestCostCenter();
    const request = await createTestRequest({
      requesterId: requester.id, approverManagerId: approver.id, costCenterId: costCenter.id,
      currentStage: "VALIDACAO_ORCAMENTARIA", estimatedValue: 10000, demandType: "COMPRA_SERVICO",
    });

    const res = await PATCH(patchRequest({ budgetOk: true, actorId: buyer.id }), { params: { id: request.id } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.currentStage).toBe("COTACAO");

    const events = await prisma.stageEvent.findMany({ where: { requestId: request.id } });
    expect(events).toHaveLength(1);
    expect(events[0].toStage).toBe("COTACAO");
  });

  it("rejeita quando o ator não tem papel Comprador", async () => {
    const requester = await createTestUser([]);
    const nonBuyer = await createTestUser(["JURIDICO"]);
    const approver = await createTestUser(["APROVADOR"]);
    const costCenter = await createTestCostCenter();
    const request = await createTestRequest({
      requesterId: requester.id, approverManagerId: approver.id, costCenterId: costCenter.id,
      currentStage: "VALIDACAO_ORCAMENTARIA", estimatedValue: 10000,
    });

    const res = await PATCH(patchRequest({ budgetOk: true, actorId: nonBuyer.id }), { params: { id: request.id } });

    expect(res.status).toBe(403);
    const unchanged = await prisma.purchaseRequest.findUnique({ where: { id: request.id } });
    expect(unchanged?.currentStage).toBe("VALIDACAO_ORCAMENTARIA");
  });

  it("roteia Ferramenta Nova para Due Diligence em vez de Cotação", async () => {
    const requester = await createTestUser([]);
    const buyer = await createTestUser(["COMPRADOR"]);
    const approver = await createTestUser(["APROVADOR"]);
    const costCenter = await createTestCostCenter();
    const request = await createTestRequest({
      requesterId: requester.id, approverManagerId: approver.id, costCenterId: costCenter.id,
      currentStage: "VALIDACAO_ORCAMENTARIA", estimatedValue: 10000, demandType: "FERRAMENTA_NOVA",
    });

    const res = await PATCH(patchRequest({ budgetOk: true, actorId: buyer.id }), { params: { id: request.id } });
    const data = await res.json();

    expect(data.currentStage).toBe("DUE_DILIGENCE");
  });

  it("cria exceção orçamentária pendente na alçada correta quando não há orçamento", async () => {
    const requester = await createTestUser([]);
    const buyer = await createTestUser(["COMPRADOR"]);
    const approver = await createTestUser(["APROVADOR"]);
    const costCenter = await createTestCostCenter();
    // R$ 25.000 -> nível 2 (acima de 10k) -> exige Gerente F&NC. Não usar
    // 10.000 aqui: é exatamente o corte, e pertence ao Nível 1.
    const request = await createTestRequest({
      requesterId: requester.id, approverManagerId: approver.id, costCenterId: costCenter.id,
      currentStage: "VALIDACAO_ORCAMENTARIA", estimatedValue: 25000,
    });

    const res = await PATCH(patchRequest({ budgetOk: false, actorId: buyer.id }), { params: { id: request.id } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe("EXCECAO_PENDENTE");
    expect(data.exception.level).toBe(2);
  });

  it("reprova a exceção e cancela a solicitação quando decidida por quem tem a alçada certa", async () => {
    const requester = await createTestUser([]);
    const buyer = await createTestUser(["COMPRADOR"]);
    const approver = await createTestUser(["APROVADOR"]);
    const gerenteFnc = await createTestUser(["GERENTE_FNC"]);
    const costCenter = await createTestCostCenter();
    const request = await createTestRequest({
      requesterId: requester.id, approverManagerId: approver.id, costCenterId: costCenter.id,
      currentStage: "VALIDACAO_ORCAMENTARIA", estimatedValue: 25000, // Nível 2 -> Gerente F&NC
    });
    await PATCH(patchRequest({ budgetOk: false, actorId: buyer.id }), { params: { id: request.id } });

    const res = await PATCH(
      patchRequest({ budgetOk: false, exceptionDecision: "REPROVADO", exceptionApproverId: gerenteFnc.id, justification: "Sem verba no trimestre." }),
      { params: { id: request.id } }
    );
    const data = await res.json();

    expect(data.status).toBe("REPROVADO");
    const updated = await prisma.purchaseRequest.findUnique({ where: { id: request.id } });
    expect(updated?.currentStage).toBe("CANCELADO");
    expect(updated?.status).toBe("CANCELADO");
  });

  it("rejeita decisão de exceção por quem não tem a alçada exigida (Coordenação decidindo Nível 2)", async () => {
    const requester = await createTestUser([]);
    const buyer = await createTestUser(["COMPRADOR"]);
    const approver = await createTestUser(["APROVADOR"]);
    const coordenacao = await createTestUser(["COORDENACAO"]); // só serve para Nível 1
    const costCenter = await createTestCostCenter();
    const request = await createTestRequest({
      requesterId: requester.id, approverManagerId: approver.id, costCenterId: costCenter.id,
      currentStage: "VALIDACAO_ORCAMENTARIA", estimatedValue: 25000, // Nível 2 -> exige Gerente F&NC
    });
    await PATCH(patchRequest({ budgetOk: false, actorId: buyer.id }), { params: { id: request.id } });

    const res = await PATCH(
      patchRequest({ budgetOk: false, exceptionDecision: "APROVADO", exceptionApproverId: coordenacao.id, justification: "x" }),
      { params: { id: request.id } }
    );

    expect(res.status).toBe(403);
    const unchanged = await prisma.purchaseRequest.findUnique({ where: { id: request.id } });
    expect(unchanged?.currentStage).toBe("VALIDACAO_ORCAMENTARIA");
  });
});
