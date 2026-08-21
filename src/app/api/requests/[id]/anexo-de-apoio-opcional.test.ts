import { describe, it, expect, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import type { DemandType } from "@prisma/client";
import { createTestUser, createTestCostCenter, createTestRequest, cleanupTestData, TEST_PREFIX } from "@/test-helpers/fixtures";

/**
 * O anexo de apoio do orçamento é OPCIONAL, e nada no fluxo depende dele.
 *
 * Este arquivo se chamava comprovante-fpa.test.ts e provava o contrário: que
 * cinco pontos do fluxo devolviam 422 quando uma solicitação de Orçamento
 * Extra não tinha o print da aprovação do FP&A anexado. A exigência caiu em
 * 21/08/2026, por decisão do dono do sistema, quando o registro da aprovação
 * passou a ser o próprio sistema: o solicitante detalha valor, base, vigência,
 * impacto e motivo no modal da abertura, e quem tem a alçada decide a exceção
 * dentro do alAi, com decisão, autor, justificativa e data em BudgetException.
 *
 * O arquivo continua existindo, invertido, porque uma regra removida sem teste
 * volta sozinha: alguém lê um comentário antigo, ou o achado 8 da auditoria, e
 * "conserta" a falta da cobrança. Cada caso aqui é um ponto onde havia 422 e
 * hoje tem que passar.
 */

vi.mock("@/lib/integrations/gmail", async (importOriginal) => ({
  // Templates REAIS: sao funcoes puras que so montam texto, e mockar so
  // algumas quebrava a suite inteira a cada template novo. Simula-se apenas o
  // transporte, que e o que nao pode sair de verdade no teste.
  ...(await importOriginal<typeof import("@/lib/integrations/gmail")>()),
  sendPurchaseEmail: async () => {},
}));
vi.mock("@/lib/integrations/slack", () => ({ sendSlackDM: async () => {} }));

const { POST: criarSolicitacao } = await import("../route");
const { PATCH: validacaoOrcamentaria } = await import("./validacao-orcamentaria/route");
const { PATCH: triagem } = await import("./triagem/route");

afterAll(async () => {
  const usuarios = await prisma.user.findMany({ where: { email: { contains: TEST_PREFIX } }, select: { id: true } });
  const idsDeUsuario = usuarios.map((u) => u.id);
  if (idsDeUsuario.length > 0) {
    const solicitacoes = await prisma.purchaseRequest.findMany({
      where: { requesterId: { in: idsDeUsuario } },
      select: { id: true },
    });
    const ids = solicitacoes.map((s) => s.id);
    if (ids.length > 0) {
      await prisma.stageEvent.deleteMany({ where: { requestId: { in: ids } } });
      await prisma.budgetException.deleteMany({ where: { requestId: { in: ids } } });
      await prisma.attachment.deleteMany({ where: { requestId: { in: ids } } });
      await prisma.notification.deleteMany({ where: { requestId: { in: ids } } });
      await prisma.purchaseRequest.deleteMany({ where: { id: { in: ids } } });
    }
  }
  await cleanupTestData();
});

function patch(
  handler: (req: NextRequest, ctx: { params: { id: string } }) => Promise<Response>,
  rota: string,
  id: string,
  body: unknown,
) {
  return handler(
    new NextRequest(`http://localhost/api/requests/${id}/${rota}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { id } },
  );
}

async function anexarDocumentoDeApoio(requestId: string, uploadedBy: string) {
  return prisma.attachment.create({
    data: {
      requestId,
      category: "APROVACAO_EXTRA_ORCAMENTARIA",
      fileName: `apoio-orcamento-${TEST_PREFIX}.pdf`,
      storageUrl: "local://teste/apoio-orcamento.pdf",
      uploadedBy,
    },
  });
}

/** Solicitação SEM anexo nenhum, que é o cenário sob teste em quase tudo aqui. */
async function cenario(params: {
  stage: "TRIAGEM" | "VALIDACAO_ORCAMENTARIA";
  extraBudget: boolean;
  demandType?: DemandType;
}) {
  const requester = await createTestUser([]);
  const gestor = await createTestUser(["APROVADOR"]);
  const costCenter = await createTestCostCenter();
  const req = await createTestRequest({
    requesterId: requester.id,
    approverManagerId: gestor.id,
    costCenterId: costCenter.id,
    currentStage: params.stage,
    estimatedValue: 20000, // Nível 2 da exceção: exige Gerente F&NC.
    demandType: params.demandType,
  });
  if (params.extraBudget) {
    await prisma.purchaseRequest.update({ where: { id: req.id }, data: { extraBudget: true } });
  }
  return { req, requester };
}

describe("Anexo de apoio do orçamento: opcional em todos os pontos que antes o exigiam", () => {
  it("a criação aceita Orçamento Extra sem anexo, com o detalhamento preenchido", async () => {
    const solicitante = await createTestUser([]);
    const costCenter = await createTestCostCenter();

    const res = await criarSolicitacao(
      new NextRequest("http://localhost/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesterId: solicitante.id,
          diretoria: "TECNOLOGIA",
          costCenterId: costCenter.id,
          leadershipPreApproved: true,
          extraBudget: true,
          estimatedValue: 20000,
          extraBudgetBasis: "TOTAL",
          extraBudgetStart: "2027-01-01",
          extraBudgetEnd: "2027-06-30",
          extraBudgetImpact: "PONTUAL",
          extraBudgetJustification: "Necessidade posterior ao fechamento do orçamento.",
          priority: "MEDIA",
          demandType: "COMPRA_SERVICO",
          shortDescription: "Compra extra-orçamentária sem anexo",
          longDescription: "Criada por teste do anexo opcional.",
          suggestedDeadline: new Date(Date.now() + 30 * 86_400_000).toISOString(),
          quantity: 1,
        }),
      }),
    );

    expect(res.status).toBe(201);
    expect((await res.json()).extraBudget).toBe(true);
  });

  it("o ramo 'há orçamento disponível' avança sem anexo", async () => {
    const comprador = await createTestUser(["COMPRADOR"]);
    const { req } = await cenario({ stage: "VALIDACAO_ORCAMENTARIA", extraBudget: true });

    const res = await patch(validacaoOrcamentaria, "validacao-orcamentaria", req.id, {
      actorId: comprador.id,
      budgetOk: true,
      observation: "Achei uma linha que cobre.",
    });

    expect(res.status).toBe(200);
    const depois = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(depois.currentStage).not.toBe("VALIDACAO_ORCAMENTARIA");
  });

  it("abrir a exceção orçamentária funciona sem anexo", async () => {
    const comprador = await createTestUser(["COMPRADOR"]);
    const { req } = await cenario({ stage: "VALIDACAO_ORCAMENTARIA", extraBudget: true });

    const res = await patch(validacaoOrcamentaria, "validacao-orcamentaria", req.id, {
      actorId: comprador.id,
      budgetOk: false,
    });

    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.status).toBe("EXCECAO_PENDENTE");
    expect(corpo.exception.level).toBe(2);
    expect(corpo.exception.attachmentId).toBeNull();
  });

  it("APROVAR a exceção funciona sem anexo, e é o ponto que mais importa", async () => {
    // Era aqui que a compra sem orçamento ficava liberada, e era aqui que o
    // 422 mais doía. O registro da aprovação é o próprio BudgetException,
    // conferido abaixo.
    const comprador = await createTestUser(["COMPRADOR"]);
    const gerente = await createTestUser(["GERENTE_FNC"]);
    const { req } = await cenario({ stage: "VALIDACAO_ORCAMENTARIA", extraBudget: true });

    await patch(validacaoOrcamentaria, "validacao-orcamentaria", req.id, { actorId: comprador.id, budgetOk: false });
    const res = await patch(validacaoOrcamentaria, "validacao-orcamentaria", req.id, {
      budgetOk: false,
      exceptionDecision: "APROVADO",
      exceptionApproverId: gerente.id,
      justification: "Aprovado: contratação não pode esperar o próximo ciclo.",
    });

    expect(res.status).toBe(200);

    const excecao = await prisma.budgetException.findUniqueOrThrow({ where: { requestId: req.id } });
    expect(excecao.decision).toBe("APROVADO");
    expect(excecao.justification).toContain("não pode esperar");
    expect(excecao.decidedAt).not.toBeNull();
    expect(excecao.level).toBe(2);
  });

  it("o atalho de CANCELAMENTO na Triagem segue para o Jurídico sem anexo", async () => {
    const comprador = await createTestUser(["COMPRADOR"]);
    const { req } = await cenario({ stage: "TRIAGEM", extraBudget: true, demandType: "CANCELAMENTO" });

    const res = await patch(triagem, "triagem", req.id, { buyerId: comprador.id });

    expect(res.status).toBe(200);
    const depois = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(depois.currentStage).toBe("JURIDICO");
  });

  it("quando o anexo existe, continua vinculado à exceção", async () => {
    // Opcional não quer dizer ignorado: quem junta um documento espera
    // encontrá-lo ligado à exceção a que ele se refere.
    const comprador = await createTestUser(["COMPRADOR"]);
    const { req, requester } = await cenario({ stage: "VALIDACAO_ORCAMENTARIA", extraBudget: true });
    const anexo = await anexarDocumentoDeApoio(req.id, requester.id);

    const res = await patch(validacaoOrcamentaria, "validacao-orcamentaria", req.id, {
      actorId: comprador.id,
      budgetOk: false,
    });

    expect(res.status).toBe(200);
    expect((await res.json()).exception.attachmentId).toBe(anexo.id);
  });

  it("REPROVAR a exceção continua livre, como sempre foi", async () => {
    const comprador = await createTestUser(["COMPRADOR"]);
    const gerente = await createTestUser(["GERENTE_FNC"]);
    const { req } = await cenario({ stage: "VALIDACAO_ORCAMENTARIA", extraBudget: true });

    await patch(validacaoOrcamentaria, "validacao-orcamentaria", req.id, { actorId: comprador.id, budgetOk: false });
    const res = await patch(validacaoOrcamentaria, "validacao-orcamentaria", req.id, {
      budgetOk: false,
      exceptionDecision: "REPROVADO",
      exceptionApproverId: gerente.id,
      justification: "Sem verba no trimestre.",
    });

    expect(res.status).toBe(200);
    const depois = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(depois.currentStage).toBe("CANCELADO");
  });

  it("a alçada da exceção continua sendo cobrada: Coordenação não decide Nível 2", async () => {
    // O que caiu foi a exigência de DOCUMENTO. O controle de QUEM pode
    // decidir, que é o que de fato protege o gasto, segue de pé.
    const comprador = await createTestUser(["COMPRADOR"]);
    const coordenacao = await createTestUser(["COORDENACAO"]);
    const { req } = await cenario({ stage: "VALIDACAO_ORCAMENTARIA", extraBudget: true });

    await patch(validacaoOrcamentaria, "validacao-orcamentaria", req.id, { actorId: comprador.id, budgetOk: false });
    const res = await patch(validacaoOrcamentaria, "validacao-orcamentaria", req.id, {
      budgetOk: false,
      exceptionDecision: "APROVADO",
      exceptionApproverId: coordenacao.id,
      justification: "tentando aprovar acima da minha alçada",
    });

    expect(res.status).toBe(403);
  });
});
