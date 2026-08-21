import { describe, it, expect, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createTestUser, createTestCostCenter, cleanupTestData, TEST_PREFIX } from "@/test-helpers/fixtures";

/**
 * Detalhamento obrigatório do Orçamento Extra na abertura (pedido do dono do
 * sistema em 21/08/2026).
 *
 * O que está sob teste é a ROTA, não o modal. A tela já desabilita o Enviar
 * sem o detalhamento, mas essa trava não vale nada sozinha: um POST direto
 * passa por cima dela, e foi exatamente esse o padrão de falha que a auditoria
 * de 19 e 20/08 encontrou repetidas vezes neste projeto (regra que existia só
 * no formulário).
 *
 * A obrigatoriedade não está no banco de propósito: as colunas são anuláveis
 * porque as solicitações abertas antes desta data não têm como preenchê-las, e
 * uma CHECK condicional travaria o histórico.
 */

vi.mock("@/lib/integrations/gmail", async (importOriginal) => ({
  // Templates REAIS: sao funcoes puras que so montam texto, e mockar so
  // algumas quebrava a suite inteira a cada template novo. Simula-se apenas o
  // transporte, que e o que nao pode sair de verdade no teste.
  ...(await importOriginal<typeof import("@/lib/integrations/gmail")>()),
  sendPurchaseEmail: async () => {},
}));
vi.mock("@/lib/integrations/slack", () => ({ sendSlackDM: async () => {} }));

const { POST } = await import("./route");

afterAll(async () => {
  // As solicitações criadas aqui nascem com código sequencial real
  // (PC-AAAA-NNNN), fora do filtro por TEST_PREFIX do cleanup. O recorte é
  // pelos usuários deste módulo. Mesmo padrão de comprovante-fpa.test.ts.
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

async function base() {
  const solicitante = await createTestUser([]);
  const costCenter = await createTestCostCenter();
  return {
    solicitante,
    corpo: {
      requesterId: solicitante.id,
      diretoria: "TECNOLOGIA",
      costCenterId: costCenter.id,
      leadershipPreApproved: true,
      priority: "MEDIA",
      demandType: "COMPRA_SERVICO",
      shortDescription: "Compra sem linha de orçamento",
      longDescription: "Teste do detalhamento obrigatório do Orçamento Extra.",
      suggestedDeadline: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      quantity: 1,
    },
  };
}

const DETALHAMENTO_OK = {
  estimatedValue: 24000,
  extraBudgetBasis: "ANUAL",
  extraBudgetStart: "2027-01-01",
  extraBudgetEnd: "2027-12-31",
  extraBudgetImpact: "RECORRENTE",
  extraBudgetJustification: "Ferramenta contratada depois do fechamento do orçamento.",
};

function post(corpo: unknown) {
  return POST(
    new NextRequest("http://localhost/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    }),
  );
}

describe("POST /api/requests: detalhamento do Orçamento Extra", () => {
  it("grava os cinco campos quando o detalhamento vem completo", async () => {
    const { corpo } = await base();

    const res = await post({ ...corpo, extraBudget: true, ...DETALHAMENTO_OK });

    expect(res.status).toBe(201);
    const criada = await res.json();
    const gravada = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: criada.id } });
    expect(gravada.extraBudget).toBe(true);
    expect(Number(gravada.estimatedValue)).toBe(24000);
    expect(gravada.extraBudgetBasis).toBe("ANUAL");
    expect(gravada.extraBudgetImpact).toBe("RECORRENTE");
    expect(gravada.extraBudgetJustification).toContain("depois do fechamento");
    expect(gravada.extraBudgetStart?.toISOString().slice(0, 10)).toBe("2027-01-01");
    expect(gravada.extraBudgetEnd?.toISOString().slice(0, 10)).toBe("2027-12-31");
  });

  // Um caso por campo: o laço da rota é genérico, e um teste só provaria que
  // ALGUM campo é exigido, não que todos são.
  for (const ausente of [
    "estimatedValue",
    "extraBudgetBasis",
    "extraBudgetStart",
    "extraBudgetEnd",
    "extraBudgetImpact",
    "extraBudgetJustification",
  ] as const) {
    it(`recusa quando falta ${ausente}`, async () => {
      const { corpo } = await base();
      const detalhamento: Record<string, unknown> = { ...DETALHAMENTO_OK };
      delete detalhamento[ausente];

      const res = await post({ ...corpo, extraBudget: true, ...detalhamento });

      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain("detalhamento completo");
    });
  }

  it("recusa base fora do enum, em vez de estourar no driver do banco", async () => {
    const { corpo } = await base();

    const res = await post({ ...corpo, extraBudget: true, ...DETALHAMENTO_OK, extraBudgetBasis: "SEMESTRAL" });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Base do valor inválida");
  });

  it("recusa impacto fora do enum", async () => {
    const { corpo } = await base();

    const res = await post({ ...corpo, extraBudget: true, ...DETALHAMENTO_OK, extraBudgetImpact: "TALVEZ" });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Impacto financeiro inválido");
  });

  it("recusa vigência que termina antes de começar", async () => {
    const { corpo } = await base();

    const res = await post({
      ...corpo, extraBudget: true, ...DETALHAMENTO_OK,
      extraBudgetStart: "2027-06-01", extraBudgetEnd: "2027-01-01",
    });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("anterior ao início");
  });

  it("aceita início igual ao fim: vigência de um dia é válida", async () => {
    const { corpo } = await base();

    const res = await post({
      ...corpo, extraBudget: true, ...DETALHAMENTO_OK,
      extraBudgetStart: "2027-03-10", extraBudgetEnd: "2027-03-10",
    });

    expect(res.status).toBe(201);
  });

  it("não exige nada disso de quem informou linha de orçamento", async () => {
    const { corpo } = await base();

    const res = await post({ ...corpo, extraBudget: false, budgetLineText: "Tecnologia / Licenças" });

    expect(res.status).toBe(201);
  });

  it("ignora o detalhamento enviado junto de uma linha comum, em vez de gravar resíduo", async () => {
    const { corpo } = await base();

    const res = await post({
      ...corpo, extraBudget: false, budgetLineText: "Tecnologia / Licenças", ...DETALHAMENTO_OK,
    });

    expect(res.status).toBe(201);
    const criada = await res.json();
    const gravada = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: criada.id } });
    expect(gravada.extraBudgetBasis).toBeNull();
    expect(gravada.extraBudgetStart).toBeNull();
    expect(gravada.extraBudgetEnd).toBeNull();
    expect(gravada.extraBudgetImpact).toBeNull();
    expect(gravada.extraBudgetJustification).toBeNull();
  });

  it("o valor estimado continua opcional na compra comum, que é a regra antiga", async () => {
    const { corpo } = await base();

    const res = await post({ ...corpo, extraBudget: false, budgetLineText: "Tecnologia / Licenças" });

    expect(res.status).toBe(201);
    const gravada = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: (await res.json()).id } });
    expect(gravada.estimatedValue).toBeNull();
  });
});
