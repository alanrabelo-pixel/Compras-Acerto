import { describe, it, expect, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import type { DemandType } from "@prisma/client";
import { createTestUser, createTestCostCenter, createTestRequest, cleanupTestData, TEST_PREFIX } from "@/test-helpers/fixtures";

/**
 * Comprovante de aprovação do FP&A: os dois caminhos que continuavam abertos
 * depois da correção parcial de 19/08 (que só fechou o ramo da exceção
 * orçamentária em validacao-orcamentaria).
 *
 * 1. CRIAÇÃO (POST /api/requests): aceita extraBudget=true sem anexo nenhum.
 *    Não dá para exigir o arquivo no mesmo POST, porque ele só é enviável
 *    depois que a solicitação existe (o formulário faz create e só então
 *    uploadIfPresent). A cobrança foi colocada na PRIMEIRA transição seguinte,
 *    PATCH aprovacao-gestor, e este arquivo testa as duas pontas: que a
 *    criação continua passando (formulário intacto) e que a aprovação do
 *    gestor trava sem o documento.
 *
 * 2. RAMO "há orçamento disponível" de validacao-orcamentaria: avançava sem
 *    olhar o comprovante, sem criar BudgetException e sem registrar nada.
 *
 * Não é um teste de autorização: o que está sob teste é a regra de negócio do
 * comprovante, não quem pode agir. Por isso LOCAL_BYPASS_AUTH fica como a
 * suíte a define (ligado, via .env), igual ao route.orcamento-extra.test.ts
 * vizinho. Os papéis existem aqui só para as rotas chegarem na regra testada.
 */

// Integrações fora do teste: sem os mocks, cada avanço de etapa tenta um envio
// real pela Gmail API e grava linha em Notification. O que está sob teste é o
// bloqueio, não o aviso.
vi.mock("@/lib/integrations/gmail", () => ({
  sendPurchaseEmail: async () => {},
  templates: {
    confirmacaoRecebimento: () => ({ subject: "Confirmação de teste", html: "<p>teste</p>" }),
    atualizacaoEtapa: () => ({ subject: "Etapa de teste", html: "<p>teste</p>" }),
    reprovado: () => ({ subject: "Reprovação de teste", html: "<p>teste</p>" }),
  },
}));

vi.mock("@/lib/integrations/slack", () => ({
  sendSlackDM: async () => {},
}));

const { POST: criarSolicitacao } = await import("../route");
const { PATCH: validacaoOrcamentaria } = await import("./validacao-orcamentaria/route");
const { PATCH: triagem } = await import("./triagem/route");

function patch(
  handler: (req: NextRequest, ctx: { params: { id: string } }) => Promise<Response>,
  rota: string,
  id: string,
  body: unknown
) {
  return handler(
    new NextRequest(`http://localhost/api/requests/${id}/${rota}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { id } }
  );
}

/** Simula o uploadIfPresent do formulário, que roda DEPOIS da criação. */
async function anexarComprovante(requestId: string, uploadedBy: string) {
  return prisma.attachment.create({
    data: {
      requestId,
      category: "APROVACAO_EXTRA_ORCAMENTARIA",
      fileName: `aprovacao-fpa-${TEST_PREFIX}.pdf`,
      storageUrl: "local://teste/aprovacao-fpa.pdf",
      uploadedBy,
    },
  });
}

async function cenario(params: {
  stage: "TRIAGEM" | "VALIDACAO_ORCAMENTARIA";
  extraBudget: boolean;
  comAnexo: boolean;
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
    estimatedValue: 20000,
    demandType: params.demandType,
  });
  if (params.extraBudget) {
    await prisma.purchaseRequest.update({ where: { id: req.id }, data: { extraBudget: true } });
  }
  if (params.comAnexo) {
    await anexarComprovante(req.id, requester.id);
  }
  return { req, requester, gestor };
}

/**
 * NO TOPO DO ARQUIVO, DE PROPÓSITO, e não dentro de um describe.
 *
 * Este arquivo tem dois describes de primeiro nível, e a limpeza vivia dentro
 * do primeiro. Ela rodava ao fim daquele bloco, e o segundo ("exceção
 * orçamentária sem a marcação de Orçamento Extra") criava dados depois disso,
 * sem ninguém para apagá-los. Nenhum teste falhava, porque no instante da
 * limpeza o banco estava mesmo limpo.
 *
 * Ao acrescentar um describe aqui, não crie outra limpeza: esta já o cobre.
 */
afterAll(async () => {
  // As solicitações abertas pela própria rota nascem com código sequencial
  // real (PC-AAAA-NNNN), então cleanupTestData(), que filtra por TEST_PREFIX
  // no code, não as alcança. O recorte é pelos usuários deste módulo.
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

describe("Comprovante do FP&A: criação e ramo de orçamento disponível", () => {
  describe("POST /api/requests (criação)", () => {
    it("continua criando com Orçamento Extra e sem anexo, porque o anexo só existe depois da criação", async () => {
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
            priority: "MEDIA",
            demandType: "COMPRA_SERVICO",
            shortDescription: "Compra extra-orçamentária aberta pelo formulário",
            longDescription: "Criada por teste do comprovante do FP&A.",
            suggestedDeadline: new Date(Date.now() + 30 * 86_400_000).toISOString(),
            quantity: 1,
          }),
        })
      );

      // Se a exigência tivesse sido colocada aqui, o formulário nunca
      // conseguiria enviar: ele só anexa depois de receber este id.
      expect(res.status).toBe(201);
      const criada = (await res.json()) as { id: string; extraBudget: boolean; currentStage: string };
      expect(criada.extraBudget).toBe(true);
      // Desde 21/08/2026 a abertura vai direto para a Triagem: a etapa
      // Aprovação do Gestor saiu do fluxo (ver a nota de legado em STAGES).
      expect(criada.currentStage).toBe("TRIAGEM");
    });
  });

  /*
   * O bloco que testava PATCH aprovacao-gestor saiu em 21/08/2026 junto com a
   * rota. Ele cobria um quarto ponto de cobrança do comprovante do FP&A, que
   * deixou de existir com a etapa. Os três que sobraram, e que são os que
   * decidem de verdade, estão nos describes abaixo: o ramo "há orçamento
   * disponível", a abertura da exceção e a aprovação da exceção.
   *
   * Uma consequência ficou registrada em docs/registro-2026-08-21.md: aquele
   * ponto era o único ANTES da Triagem, e a Triagem tem atalho para o Jurídico
   * quando demandType é CANCELAMENTO, que pula a Validação Orçamentária. Ver
   * o teste de fronteira ao fim deste arquivo.
   */

  describe("PATCH /api/requests/[id]/validacao-orcamentaria, ramo 'há orçamento disponível'", () => {
    it("recusa avançar por 'há orçamento' uma solicitação de Orçamento Extra sem comprovante", async () => {
      const comprador = await createTestUser(["COMPRADOR"]);
      const { req } = await cenario({ stage: "VALIDACAO_ORCAMENTARIA", extraBudget: true, comAnexo: false });

      const res = await patch(validacaoOrcamentaria, "validacao-orcamentaria", req.id, {
        actorId: comprador.id,
        budgetOk: true,
        observation: "Achei uma linha que cobre.",
      });

      expect(res.status).toBe(422);
      const corpo = await res.json();
      expect(corpo.error).toContain("FP&A");

      // Este era o buraco maior dos dois: aqui não se cria BudgetException
      // nenhuma, então a solicitação sairia da etapa sem exceção, sem
      // documento e sem registro de que a compra é extra-orçamentária.
      const depois = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: req.id } });
      expect(depois.currentStage).toBe("VALIDACAO_ORCAMENTARIA");
      expect(await prisma.budgetException.findUnique({ where: { requestId: req.id } })).toBeNull();
    });

    it("avança quando o comprovante está anexado", async () => {
      const comprador = await createTestUser(["COMPRADOR"]);
      const { req } = await cenario({ stage: "VALIDACAO_ORCAMENTARIA", extraBudget: true, comAnexo: true });

      const res = await patch(validacaoOrcamentaria, "validacao-orcamentaria", req.id, {
        actorId: comprador.id,
        budgetOk: true,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.currentStage).toBe("COTACAO");
    });

    it("não exige comprovante de quem informou linha de orçamento", async () => {
      const comprador = await createTestUser(["COMPRADOR"]);
      const { req } = await cenario({ stage: "VALIDACAO_ORCAMENTARIA", extraBudget: false, comAnexo: false });

      const res = await patch(validacaoOrcamentaria, "validacao-orcamentaria", req.id, {
        actorId: comprador.id,
        budgetOk: true,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.currentStage).toBe("COTACAO");
    });
  });
});

/**
 * O caso espelhado, que ficou aberto na primeira correção e um agente
 * adversarial encontrou: o controle inteiro dependia de `extraBudget`, um
 * booleano que o solicitante declara na criação. Bastava digitar qualquer
 * coisa no campo Linha do Orçamento para desligar os três pontos de cobrança
 * de uma vez. E o momento em que o próprio sistema conclui que a compra é
 * extra-orçamentária, o comprador respondendo "não há orçamento", não exigia
 * documento nenhum.
 */
describe("exceção orçamentária sem a marcação de Orçamento Extra", () => {
  it("abrir a exceção continua livre, e a solicitação passa a constar como extra-orçamentária", async () => {
    // Travar a abertura deixaria sem saída quem não marcou a caixa: essa
    // pessoa nunca teve onde anexar o comprovante. O que a abertura faz é
    // corrigir o registro, para os pontos seguintes pararem de consultar um
    // booleano que já se sabe errado.
    const { req } = await cenario({ stage: "VALIDACAO_ORCAMENTARIA", extraBudget: false, comAnexo: false });
    const comprador = await createTestUser(["COMPRADOR"]);

    const res = await patch(validacaoOrcamentaria, "validacao-orcamentaria", req.id, {
      budgetOk: false,
      actorId: comprador.id,
    });

    expect(res.status).toBe(200);
    const depois = await prisma.purchaseRequest.findUnique({ where: { id: req.id } });
    expect(depois?.extraBudget).toBe(true);
  });

  it("recusa APROVAR a exceção sem comprovante, mesmo sem a marcação na abertura", async () => {
    const { req } = await cenario({ stage: "VALIDACAO_ORCAMENTARIA", extraBudget: false, comAnexo: false });
    const comprador = await createTestUser(["COMPRADOR"]);
    const aprovador = await createTestUser(["COORDENACAO", "GERENTE_FNC"]);

    await patch(validacaoOrcamentaria, "validacao-orcamentaria", req.id, { budgetOk: false, actorId: comprador.id });
    const res = await patch(validacaoOrcamentaria, "validacao-orcamentaria", req.id, {
      budgetOk: false,
      exceptionDecision: "APROVADO",
      exceptionApproverId: aprovador.id,
    });

    expect(res.status).toBe(422);
    const depois = await prisma.purchaseRequest.findUnique({ where: { id: req.id } });
    expect(depois?.currentStage).toBe("VALIDACAO_ORCAMENTARIA");
  });

  it("REPROVAR a exceção segue livre sem comprovante, senão a solicitação fica presa", async () => {
    const { req } = await cenario({ stage: "VALIDACAO_ORCAMENTARIA", extraBudget: false, comAnexo: false });
    const comprador = await createTestUser(["COMPRADOR"]);
    const aprovador = await createTestUser(["COORDENACAO", "GERENTE_FNC"]);

    await patch(validacaoOrcamentaria, "validacao-orcamentaria", req.id, { budgetOk: false, actorId: comprador.id });
    const res = await patch(validacaoOrcamentaria, "validacao-orcamentaria", req.id, {
      budgetOk: false,
      exceptionDecision: "REPROVADO",
      exceptionApproverId: aprovador.id,
      justification: "sem orçamento e sem validação do FP&A",
    });

    expect(res.status).toBe(200);
  });
});

/*
 * A rota de fuga que a remoção da Aprovação do Gestor abriu, e que foi
 * fechada no mesmo commit.
 *
 * O atalho de CANCELAMENTO na Triagem vai direto para o Jurídico e pula a
 * Validação Orçamentária inteira, que é onde o comprovante é cobrado. Com a
 * Aprovação do Gestor no fluxo, a fuga era barrada antes da Triagem. Sem ela,
 * o atalho passou a ser a única saída sem cobrança, e por isso a checagem foi
 * acrescentada lá.
 */
describe("Triagem: atalho de CANCELAMENTO não é rota de fuga do comprovante", () => {
  it("barra o atalho para o Jurídico quando é Orçamento Extra sem comprovante", async () => {
    const comprador = await createTestUser(["COMPRADOR"]);
    const { req } = await cenario({
      stage: "TRIAGEM", extraBudget: true, comAnexo: false, demandType: "CANCELAMENTO",
    });

    const res = await patch(triagem, "triagem", req.id, { buyerId: comprador.id });

    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("FP&A");

    // O que mais importa: não escapou para o Jurídico.
    const depois = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(depois.currentStage).toBe("TRIAGEM");
    expect(await prisma.stageEvent.count({ where: { requestId: req.id, toStage: "JURIDICO" } })).toBe(0);
  });

  it("libera o atalho quando o comprovante está anexado", async () => {
    const comprador = await createTestUser(["COMPRADOR"]);
    const { req, requester } = await cenario({
      stage: "TRIAGEM", extraBudget: true, comAnexo: true, demandType: "CANCELAMENTO",
    });
    expect(requester).toBeDefined();

    const res = await patch(triagem, "triagem", req.id, { buyerId: comprador.id });

    expect(res.status).toBe(200);
    const depois = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(depois.currentStage).toBe("JURIDICO");
  });

  it("não atrapalha o cancelamento comum, que não é Orçamento Extra", async () => {
    const comprador = await createTestUser(["COMPRADOR"]);
    const { req } = await cenario({
      stage: "TRIAGEM", extraBudget: false, comAnexo: false, demandType: "CANCELAMENTO",
    });

    const res = await patch(triagem, "triagem", req.id, { buyerId: comprador.id });

    expect(res.status).toBe(200);
  });
});
