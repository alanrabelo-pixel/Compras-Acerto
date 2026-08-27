import { describe, it, expect, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createTestUser, createTestCostCenter, cleanupTestData, TEST_PREFIX } from "@/test-helpers/fixtures";

/**
 * Motivo da urgência obrigatório quando priority é ALTA ou CRITICA (pedido do
 * dono do sistema em 27/08/2026).
 *
 * Mesmo motivo do detalhamento do Orçamento Extra (ver
 * orcamento-extra-detalhamento.test.ts): a tela já desabilita o Enviar sem o
 * motivo, mas essa trava só vale alguma coisa se a rota também exigir — um
 * POST direto passa por cima do que só existe no formulário.
 */

vi.mock("@/lib/integrations/gmail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/integrations/gmail")>()),
  sendPurchaseEmail: async () => {},
}));
vi.mock("@/lib/integrations/slack", () => ({ sendSlackDM: async () => {} }));

const { POST } = await import("./route");

afterAll(async () => {
  const usuarios = await prisma.user.findMany({ where: { email: { contains: TEST_PREFIX } }, select: { id: true } });
  const ids = usuarios.map((u) => u.id);
  if (ids.length > 0) {
    const solicitacoes = await prisma.purchaseRequest.findMany({
      where: { requesterId: { in: ids } },
      select: { id: true },
    });
    const requestIds = solicitacoes.map((s) => s.id);
    if (requestIds.length > 0) {
      await prisma.stageEvent.deleteMany({ where: { requestId: { in: requestIds } } });
      await prisma.notification.deleteMany({ where: { requestId: { in: requestIds } } });
      await prisma.purchaseRequest.deleteMany({ where: { id: { in: requestIds } } });
    }
  }
  await cleanupTestData();
});

async function base(priority: string) {
  const solicitante = await createTestUser([]);
  const costCenter = await createTestCostCenter();
  return {
    requesterId: solicitante.id,
    diretoria: "TECNOLOGIA",
    costCenterId: costCenter.id,
    leadershipPreApproved: true,
    budgetLineText: "Tecnologia / Licenças",
    priority,
    demandType: "COMPRA_SERVICO",
    shortDescription: "Compra urgente de teste",
    longDescription: "Teste da obrigatoriedade do motivo de urgência.",
    suggestedDeadline: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    quantity: 1,
  };
}

function post(corpo: unknown) {
  return POST(
    new NextRequest("http://localhost/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    }),
  );
}

describe("POST /api/requests: motivo da urgência", () => {
  for (const priority of ["ALTA", "CRITICA"]) {
    it(`recusa ${priority} sem motivo`, async () => {
      const corpo = await base(priority);

      const res = await post(corpo);

      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain("motivo da urgência");
    });

    it(`recusa ${priority} com motivo em branco`, async () => {
      const corpo = await base(priority);

      const res = await post({ ...corpo, urgencyJustification: "   " });

      expect(res.status).toBe(400);
    });

    it(`aceita ${priority} com motivo preenchido, e grava o texto`, async () => {
      const corpo = await base(priority);

      const res = await post({ ...corpo, urgencyJustification: "Fornecedor atual encerra o contrato em 5 dias." });

      expect(res.status).toBe(201);
      const criada = await res.json();
      const gravada = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: criada.id } });
      expect(gravada.urgencyJustification).toContain("encerra o contrato");
    });
  }

  for (const priority of ["BAIXA", "MEDIA"]) {
    it(`não exige motivo para ${priority}`, async () => {
      const corpo = await base(priority);

      const res = await post(corpo);

      expect(res.status).toBe(201);
    });

    it(`ignora o motivo enviado junto de ${priority}, em vez de gravar resíduo`, async () => {
      const corpo = await base(priority);

      const res = await post({ ...corpo, urgencyJustification: "Não deveria ser gravado." });

      expect(res.status).toBe(201);
      const criada = await res.json();
      const gravada = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: criada.id } });
      expect(gravada.urgencyJustification).toBeNull();
    });
  }
});
