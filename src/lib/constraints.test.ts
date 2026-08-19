import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createTestUser, createTestCostCenter, createTestRequest, cleanupTestData } from "@/test-helpers/fixtures";

/**
 * Vários campos que são enum na prática eram texto livre no banco, com os
 * valores válidos escritos só num comentário do schema. Nada impedia gravar
 * "ABERTOO" em status, e a validação existia apenas no código da aplicação:
 * uma chamada direta, um script de correção ou uma importação futura passariam
 * por cima dela.
 *
 * Estes testes batem no banco de propósito, sem passar pelas rotas: o que se
 * quer provar é que o BANCO recusa, não que a aplicação valide antes.
 */

async function solicitacao() {
  const requester = await createTestUser([]);
  const gestor = await createTestUser(["APROVADOR"]);
  const costCenter = await createTestCostCenter();
  return createTestRequest({
    requesterId: requester.id, approverManagerId: gestor.id, costCenterId: costCenter.id,
    currentStage: "TRIAGEM", estimatedValue: 1000,
  });
}

describe("constraints de coerência", () => {
  afterAll(async () => {
    await cleanupTestData();
  });

  it("recusa status de solicitação fora da lista", async () => {
    const req = await solicitacao();

    await expect(
      prisma.purchaseRequest.update({ where: { id: req.id }, data: { status: "ABERTOO" } })
    ).rejects.toThrow();

    const depois = await prisma.purchaseRequest.findUnique({ where: { id: req.id } });
    expect(depois?.status).toBe("ABERTO");
  });

  it("aceita os três status válidos", async () => {
    const req = await solicitacao();

    for (const status of ["ABERTO", "CANCELADO", "CONCLUIDO"]) {
      await expect(
        prisma.purchaseRequest.update({ where: { id: req.id }, data: { status } })
      ).resolves.toBeTruthy();
    }
  });

  it("recusa decisão do gestor sem a data, que é meia história numa auditoria", async () => {
    const req = await solicitacao();

    await expect(
      prisma.purchaseRequest.update({
        where: { id: req.id },
        data: { managerApprovalDecision: "APROVADO" },
      })
    ).rejects.toThrow();
  });

  it("aceita decisão do gestor acompanhada da data", async () => {
    const req = await solicitacao();

    await expect(
      prisma.purchaseRequest.update({
        where: { id: req.id },
        data: { managerApprovalDecision: "APROVADO", managerApprovalDecidedAt: new Date() },
      })
    ).resolves.toBeTruthy();
  });

  it("recusa canal de notificação desconhecido", async () => {
    const req = await solicitacao();

    await expect(
      prisma.notification.create({
        data: { requestId: req.id, channel: "WHATSAPP", recipient: "x@acerto.com.br", subject: "teste" },
      })
    ).rejects.toThrow();

    await expect(
      prisma.notification.create({
        data: { requestId: req.id, channel: "EMAIL", recipient: "x@acerto.com.br", subject: "teste" },
      })
    ).resolves.toBeTruthy();
  });

  it("aceita o canal combinado do alerta de contrato, que é valor novo e legítimo", async () => {
    // EMAIL_E_SLACK entrou quando o registro passou a refletir os dois meios.
    // A constraint precisa conhecê-lo, senão o próprio cron quebraria.
    const gestor = await createTestUser(["COMPRADOR"]);
    const contrato = await prisma.contract.create({
      data: {
        supplierName: "__test_constraint__", startDate: new Date(), endDate: new Date(),
        renewalDate: new Date(), contractManagerId: gestor.id, area: "TI", costCenter: "TI",
      },
    });

    await expect(
      prisma.contractAlert.create({ data: { contractId: contrato.id, channel: "EMAIL_E_SLACK" } })
    ).resolves.toBeTruthy();

    await prisma.contractAlert.deleteMany({ where: { contractId: contrato.id } });
    await prisma.contract.delete({ where: { id: contrato.id } });
  });
});
