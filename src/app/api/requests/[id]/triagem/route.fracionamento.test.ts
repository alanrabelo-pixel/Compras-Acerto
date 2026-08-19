import { describe, it, expect, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createTestUser, createTestCostCenter, createTestRequest, cleanupTestData } from "@/test-helpers/fixtures";

/**
 * O controle anti-fracionamento detectava o risco e morria ali: a Triagem
 * gravava uma linha de Notification com status ENVIADO e não mandava nada.
 * Pior que não avisar, porque o registro afirmava que a Controladoria tinha
 * sido avisada, então nem olhando o log dava para perceber a falta.
 *
 * O envio é mockado aqui de propósito: o que precisa ser provado é que a rota
 * CHAMA o envio quando sinaliza risco, não que o Gmail funcione.
 */

const enviados = vi.hoisted(() => ({ emails: [] as { to: string; subject: string }[] }));

vi.mock("@/lib/integrations/gmail", async (original) => {
  const real = await original<typeof import("@/lib/integrations/gmail")>();
  return {
    ...real,
    sendPurchaseEmail: async (p: { to: string; subject: string }) => {
      enviados.emails.push({ to: p.to, subject: p.subject });
    },
  };
});
vi.mock("@/lib/integrations/slack", () => ({ sendSlackDM: async () => undefined }));

const { PATCH } = await import("./route");

function patch(id: string, body: unknown) {
  return PATCH(
    new NextRequest("http://localhost/api/requests/x/triagem", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { id } }
  );
}

async function solicitacaoEmTriagem(valor: number) {
  const requester = await createTestUser([]);
  const gestor = await createTestUser(["APROVADOR"]);
  const costCenter = await createTestCostCenter();
  return createTestRequest({
    requesterId: requester.id, approverManagerId: gestor.id, costCenterId: costCenter.id,
    currentStage: "TRIAGEM", estimatedValue: valor,
  });
}

describe("alerta de risco de fracionamento", () => {
  afterAll(async () => {
    await cleanupTestData();
  });

  it("avisa a Controladoria de verdade quando sinaliza risco", async () => {
    enviados.emails.length = 0;
    const comprador = await createTestUser(["COMPRADOR"]);
    // R$ 40 mil sozinho cai no Nível 1. Somado a R$ 30 mil dos últimos 12
    // meses passa de R$ 50 mil, então alcança o Nível 2: é o caso que o
    // controle existe para pegar.
    const req = await solicitacaoEmTriagem(40000);

    const res = await patch(req.id, {
      buyerId: comprador.id,
      action: "AVANCAR",
      priorRequestsValueLast12Months: 30000,
    });

    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo._meta.fragmentationFlagged).toBe(true);

    const alerta = enviados.emails.find((e) => e.subject.includes("Risco de fracionamento"));
    expect(alerta, "o alerta precisa ser enviado, não só registrado").toBeDefined();
    expect(alerta?.to).toContain("controladoria");
  });

  it("não avisa quando não há risco, para o alerta não virar ruído", async () => {
    enviados.emails.length = 0;
    const comprador = await createTestUser(["COMPRADOR"]);
    const req = await solicitacaoEmTriagem(10000);

    await patch(req.id, { buyerId: comprador.id, action: "AVANCAR", priorRequestsValueLast12Months: 0 });

    expect(enviados.emails.find((e) => e.subject.includes("Risco de fracionamento"))).toBeUndefined();
  });

  it("não grava mais um registro de notificação afirmando envio que não houve", async () => {
    enviados.emails.length = 0;
    const comprador = await createTestUser(["COMPRADOR"]);
    const req = await solicitacaoEmTriagem(40000);

    await patch(req.id, { buyerId: comprador.id, action: "AVANCAR", priorRequestsValueLast12Months: 30000 });

    // O registro manual sumiu: quem grava Notification agora é o próprio envio,
    // com ENVIADO ou FALHA conforme o resultado real. Como o envio está
    // mockado aqui, não deve sobrar nenhuma linha inventada pela rota.
    const registros = await prisma.notification.findMany({ where: { requestId: req.id } });
    expect(registros.filter((n) => n.subject?.includes("Risco de fracionamento"))).toHaveLength(0);
  });
});
