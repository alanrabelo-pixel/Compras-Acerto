import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createTestUser, createTestCostCenter, cleanupTestData, TEST_PREFIX } from "@/test-helpers/fixtures";

/**
 * Alerta ao gestor do centro de custo na abertura da solicitação.
 *
 * As regras isoladas (quem recebe, o que o texto diz) estão em
 * alerta-centro-de-custo.test.ts. Aqui se prova a LIGAÇÃO: que a rota de
 * criação chama o Slack com quem deve e com o texto certo. Sem este arquivo,
 * os outros testes continuariam verdes mesmo se ninguém chamasse a função.
 */

const enviados = vi.hoisted(() => [] as { slackUserEmail: string; text: string }[]);

vi.mock("@/lib/integrations/slack", () => ({
  sendSlackDM: async (p: { slackUserEmail: string; text: string }) => {
    enviados.push(p);
  },
}));
vi.mock("@/lib/integrations/gmail", () => ({
  sendPurchaseEmail: async () => {},
  templates: {
    confirmacaoRecebimento: () => ({ subject: "s", html: "<p>h</p>" }),
    atualizacaoEtapa: () => ({ subject: "s", html: "<p>h</p>" }),
    reprovado: () => ({ subject: "s", html: "<p>h</p>" }),
  },
}));

const { POST } = await import("./route");

beforeEach(() => {
  enviados.length = 0;
});

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

/** Centro de custo com os gestores informados já conectados. */
async function centroCom(gestorIds: string[]) {
  const cc = await createTestCostCenter();
  await prisma.costCenter.update({
    where: { id: cc.id },
    data: { managers: { connect: gestorIds.map((id) => ({ id })) } },
  });
  return cc;
}

async function abrirSolicitacao(requesterId: string, costCenterId: string) {
  return POST(
    new NextRequest("http://localhost/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requesterId,
        diretoria: "TECNOLOGIA",
        costCenterId,
        leadershipPreApproved: true,
        budgetLineText: "Tecnologia / Licenças",
        priority: "MEDIA",
        demandType: "COMPRA_SERVICO",
        shortDescription: "Licenças de observabilidade",
        longDescription: "Teste do alerta ao gestor do centro de custo.",
        suggestedDeadline: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        quantity: 1,
        estimatedValue: 24000,
      }),
    }),
  );
}

describe("POST /api/requests: alerta ao gestor do centro de custo", () => {
  it("avisa os dois gestores quando quem abre não é gestor", async () => {
    const gestorA = await createTestUser(["APROVADOR"]);
    const gestorB = await createTestUser(["APROVADOR"]);
    const solicitante = await createTestUser([]);
    const cc = await centroCom([gestorA.id, gestorB.id]);

    const res = await abrirSolicitacao(solicitante.id, cc.id);

    expect(res.status).toBe(201);
    expect(enviados.map((e) => e.slackUserEmail).sort()).toEqual([gestorA.email, gestorB.email].sort());
  });

  it("NÃO avisa o gestor que abriu a própria solicitação, e avisa o outro", async () => {
    const gestorA = await createTestUser(["APROVADOR"]);
    const gestorB = await createTestUser(["APROVADOR"]);
    const cc = await centroCom([gestorA.id, gestorB.id]);

    const res = await abrirSolicitacao(gestorA.id, cc.id);

    expect(res.status).toBe(201);
    expect(enviados).toHaveLength(1);
    expect(enviados[0].slackUserEmail).toBe(gestorB.email);
  });

  it("não manda DM nenhum quando o único gestor é quem abriu", async () => {
    // O caso mais comum: gestor abrindo no centro de custo que administra
    // sozinho. Silêncio é o comportamento certo, não uma falha de envio.
    const gestor = await createTestUser(["APROVADOR"]);
    const cc = await centroCom([gestor.id]);

    const res = await abrirSolicitacao(gestor.id, cc.id);

    expect(res.status).toBe(201);
    expect(enviados).toHaveLength(0);
  });

  it("centro de custo sem gestor não impede a abertura", async () => {
    const solicitante = await createTestUser([]);
    const cc = await createTestCostCenter();

    const res = await abrirSolicitacao(solicitante.id, cc.id);

    expect(res.status).toBe(201);
    expect(enviados).toHaveLength(0);
  });

  it("o DM leva o resumo, e diz que não é aprovação", async () => {
    const gestor = await createTestUser(["APROVADOR"]);
    const solicitante = await createTestUser([]);
    const cc = await centroCom([gestor.id]);

    await abrirSolicitacao(solicitante.id, cc.id);

    expect(enviados).toHaveLength(1);
    const texto = enviados[0].text;
    expect(texto).toContain("Licenças de observabilidade");
    expect(texto).toContain(solicitante.name);
    expect(texto).toContain("24.000,00");
    expect(texto).toContain("não um pedido de aprovação");
    expect(texto).toContain("/solicitacoes/");
  });
});
