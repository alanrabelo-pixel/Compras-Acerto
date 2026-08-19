import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { avancarEtapa } from "./etapa";
import { createTestUser, createTestCostCenter, createTestRequest, cleanupTestData } from "@/test-helpers/fixtures";

/**
 * Regressão dos três defeitos do avanço de etapa.
 *
 * O padrão anterior nas 16 rotas era ler, checar a etapa, escrever e registrar,
 * em passos soltos: havia janela entre checar e escrever, não havia transação
 * (existia UM $transaction em toda a base), e o grafo de transições em
 * workflow.ts só era consultado pelos testes.
 */

async function solicitacaoEm(stage: Parameters<typeof createTestRequest>[0]["currentStage"]) {
  const requester = await createTestUser([]);
  const gestor = await createTestUser(["APROVADOR"]);
  const costCenter = await createTestCostCenter();
  return createTestRequest({
    requesterId: requester.id, approverManagerId: gestor.id, costCenterId: costCenter.id,
    currentStage: stage, estimatedValue: 10000,
  });
}

describe("avancarEtapa", () => {
  afterAll(async () => {
    await cleanupTestData();
  });

  it("avança e registra o evento na mesma operação", async () => {
    const req = await solicitacaoEm("FISCAL");

    const r = await avancarEtapa({ requestId: req.id, de: "FISCAL", para: "TESOURARIA", actorId: null });

    expect(r.ok).toBe(true);
    const depois = await prisma.purchaseRequest.findUnique({ where: { id: req.id } });
    expect(depois?.currentStage).toBe("TESOURARIA");

    const eventos = await prisma.stageEvent.findMany({ where: { requestId: req.id, toStage: "TESOURARIA" } });
    expect(eventos).toHaveLength(1);
  });

  it("recusa transição que o grafo não prevê, em vez de gravar", async () => {
    const req = await solicitacaoEm("FISCAL");

    // Fiscal não leva a Cotação. Antes, nenhuma rota consultava o grafo.
    const r = await avancarEtapa({ requestId: req.id, de: "FISCAL", para: "COTACAO", actorId: null });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(422);

    const depois = await prisma.purchaseRequest.findUnique({ where: { id: req.id } });
    expect(depois?.currentStage).toBe("FISCAL");
    expect(await prisma.stageEvent.count({ where: { requestId: req.id, toStage: "COTACAO" } })).toBe(0);
  });

  it("recusa quando a solicitação já saiu da etapa de origem", async () => {
    const req = await solicitacaoEm("FISCAL");
    await avancarEtapa({ requestId: req.id, de: "FISCAL", para: "TESOURARIA", actorId: null });

    // Segunda tentativa a partir de uma etapa que não é mais a atual.
    const r = await avancarEtapa({ requestId: req.id, de: "FISCAL", para: "TESOURARIA", actorId: null });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(409);
    expect(await prisma.stageEvent.count({ where: { requestId: req.id, toStage: "TESOURARIA" } })).toBe(1);
  });

  it("sob concorrência, só uma chamada avança e o histórico não duplica", async () => {
    const req = await solicitacaoEm("FISCAL");

    // Três tentativas simultâneas, que é o cenário real: duas ou três pessoas
    // com a tela aberta clicando quase junto. Com dez, o teste passava a falhar
    // de forma intermitente por esgotar o pool de conexões do Prisma
    // ("Unable to start a transaction in the given time"), o que é limite de
    // pool e não a propriedade sendo testada. A propriedade vale igual com três.
    const resultados = await Promise.all(
      Array.from({ length: 3 }, () =>
        avancarEtapa({ requestId: req.id, de: "FISCAL", para: "TESOURARIA", actorId: null })
      )
    );

    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    expect(resultados.filter((r) => !r.ok)).toHaveLength(2);

    const eventos = await prisma.stageEvent.findMany({ where: { requestId: req.id, toStage: "TESOURARIA" } });
    expect(eventos, "o histórico de auditoria não pode ganhar evento duplicado").toHaveLength(1);
  });

  it("grava os campos extras na mesma transação do avanço", async () => {
    const req = await solicitacaoEm("APROVACAO");

    const r = await avancarEtapa({
      requestId: req.id,
      de: "APROVACAO",
      para: "CANCELADO",
      actorId: null,
      comentario: "Reprovado na alçada",
      dadosExtras: { status: "CANCELADO", cancelReason: "Reprovado na alçada" },
    });

    expect(r.ok).toBe(true);
    const depois = await prisma.purchaseRequest.findUnique({ where: { id: req.id } });
    expect(depois?.currentStage).toBe("CANCELADO");
    expect(depois?.status).toBe("CANCELADO");
    expect(depois?.cancelReason).toBe("Reprovado na alçada");
  });

  it("permite cancelar de qualquer etapa, como o grafo define", async () => {
    const req = await solicitacaoEm("COTACAO");

    const r = await avancarEtapa({
      requestId: req.id, de: "COTACAO", para: "CANCELADO", actorId: null,
      dadosExtras: { status: "CANCELADO" },
    });

    expect(r.ok).toBe(true);
  });
});
