import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createTestUser, createTestCostCenter, createTestRequest, cleanupTestData } from "@/test-helpers/fixtures";

/**
 * Regressão da falha de autorização na decisão de aprovação.
 *
 * Antes da correção, o PATCH só checava identidade dentro de
 * `if (personifiedBy)`. Omitindo esse campo, qualquer pessoa decidia qualquer
 * aprovação, em qualquer valor, sem papel e sem rastro (personifiedBy ficava
 * null, então o histórico atribuía a decisão ao aprovador legítimo).
 *
 * Por que este arquivo é separado de route.test.ts: os outros testes rodam com
 * LOCAL_BYPASS_AUTH="true" (vem do .env via vitest.config.ts), e é justamente
 * essa flag que faz requireRole pular a comparação com a sessão. Um teste de
 * autorização escrito naquele arquivo passaria sem exercer nada. Aqui a flag é
 * desligada e getServerSession é mockado, que é o caminho real de produção.
 */

const session = vi.hoisted(() => ({
  current: null as { user: { id: string; roles?: string[]; canViewBoard?: boolean } } | null,
}));

vi.mock("next-auth", () => ({
  getServerSession: async () => session.current,
}));

const { PATCH, POST } = await import("./route");

function patchRequest(body: unknown) {
  return new NextRequest("http://localhost/api/requests/x/aprovacao", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Monta uma solicitação em APROVACAO com uma aprovação pendente de Nível 2. */
async function scenario(estimatedValue: number) {
  const requester = await createTestUser([]);
  const approverManager = await createTestUser(["APROVADOR"]);
  const approver = await createTestUser(["APROVADOR"]);
  const intruder = await createTestUser(["SOLICITANTE"]);
  const costCenter = await createTestCostCenter();
  const request = await createTestRequest({
    requesterId: requester.id, approverManagerId: approverManager.id, costCenterId: costCenter.id,
    currentStage: "APROVACAO", estimatedValue,
  });
  const approval = await prisma.approval.create({
    data: { requestId: request.id, level: 2, approverId: approver.id, dueAt: new Date() },
  });
  return { request, approval, approver, intruder };
}

describe("PATCH /api/requests/[id]/aprovacao: autorização", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    session.current = null;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await cleanupTestData();
  });

  it("recusa quem não é o aprovador designado, mesmo omitindo personifiedBy", async () => {
    const { request, approval, intruder } = await scenario(400000);
    session.current = { user: { id: intruder.id } };

    const res = await PATCH(patchRequest({ approvalId: approval.id, decision: "APROVADO" }), {
      params: { id: request.id },
    });

    expect(res.status).toBe(403);

    // O ponto que mais importa: a decisão não pode ter sido gravada.
    const after = await prisma.approval.findUnique({ where: { id: approval.id } });
    expect(after?.decision).toBe("PENDENTE");
    const req = await prisma.purchaseRequest.findUnique({ where: { id: request.id } });
    expect(req?.currentStage).toBe("APROVACAO");
  });

  it("recusa quando não há sessão nenhuma", async () => {
    const { request, approval } = await scenario(400000);
    session.current = null;

    const res = await PATCH(patchRequest({ approvalId: approval.id, decision: "APROVADO" }), {
      params: { id: request.id },
    });

    expect(res.status).toBe(403);
    const after = await prisma.approval.findUnique({ where: { id: approval.id } });
    expect(after?.decision).toBe("PENDENTE");
  });

  it("permite que o próprio aprovador designado decida", async () => {
    const { request, approval, approver } = await scenario(400000);
    session.current = { user: { id: approver.id } };

    const res = await PATCH(patchRequest({ approvalId: approval.id, decision: "APROVADO" }), {
      params: { id: request.id },
    });

    expect(res.status).toBe(200);
    const after = await prisma.approval.findUnique({ where: { id: approval.id } });
    expect(after?.decision).toBe("APROVADO");
  });

  it("recusa decisão fora do enum, que antes avançava a solicitação como aprovada", async () => {
    const { request, approval, approver } = await scenario(400000);
    session.current = { user: { id: approver.id } };

    for (const decision of ["X", "aprovado", "", "PENDENTE"]) {
      const res = await PATCH(patchRequest({ approvalId: approval.id, decision }), {
        params: { id: request.id },
      });
      expect(res.status, `decision=${JSON.stringify(decision)}`).toBe(422);
    }

    const after = await prisma.approval.findUnique({ where: { id: approval.id } });
    expect(after?.decision).toBe("PENDENTE");
    const req = await prisma.purchaseRequest.findUnique({ where: { id: request.id } });
    expect(req?.currentStage).toBe("APROVACAO");
  });
});

/**
 * Quem CRIA o lote de aprovação também precisava de checagem, e não tinha
 * nenhuma. O requireRole do POST valida o papel de quem VAI RECEBER a
 * aprovação (requireSelf false, porque é atribuição a terceiro), e ninguém
 * olhava quem estava chamando: qualquer conta autenticada abria a aprovação de
 * uma compra na etapa de Aprovação e, sem pool de alçada configurado, escolhia
 * para quais aprovadores ela ia.
 */
describe("POST /api/requests/[id]/aprovacao: quem cria o lote", () => {
  // O stubEnv do describe de cima não alcança este bloco: beforeEach é escopado
  // ao describe onde é declarado. Sem repetir aqui, estes testes rodariam com
  // LOCAL_BYPASS_AUTH ligado, a guarda devolveria null e o teste passaria sem
  // exercer nada. Foi assim que ele falhou na primeira execução, o que é o
  // comportamento certo do teste avisando que não estava testando.
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    session.current = null;
  });

  function postRequest(body: unknown) {
    return new NextRequest("http://localhost/api/requests/x/aprovacao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function cenarioDeCriacao() {
    const requester = await createTestUser([]);
    const gestor = await createTestUser(["APROVADOR"]);
    const aprovador = await createTestUser(["APROVADOR"]);
    const comprador = await createTestUser(["COMPRADOR"]);
    const intruso = await createTestUser(["SOLICITANTE"]);
    const cc = await createTestCostCenter();
    const request = await createTestRequest({
      requesterId: requester.id, approverManagerId: gestor.id, costCenterId: cc.id,
      currentStage: "APROVACAO", estimatedValue: 10000,
    });
    // A criação exige declaração de conflito registrada e sem conflito.
    await prisma.conflictOfInterestDeclaration.create({
      data: { requestId: request.id, declaredBy: requester.id, hasConflict: false },
    });
    return { request, aprovador, comprador, intruso };
  }

  it("recusa quem não é comprador, mesmo indicando um aprovador válido", async () => {
    const { request, aprovador, intruso } = await cenarioDeCriacao();
    session.current = { user: { id: intruso.id, roles: ["SOLICITANTE"], canViewBoard: false } };

    const res = await POST(postRequest({ approverId: aprovador.id }), { params: { id: request.id } });

    expect(res.status).toBe(403);
    expect(await prisma.approval.count({ where: { requestId: request.id } })).toBe(0);
  });

  it("recusa quando não há sessão nenhuma", async () => {
    const { request, aprovador } = await cenarioDeCriacao();
    session.current = null;

    const res = await POST(postRequest({ approverId: aprovador.id }), { params: { id: request.id } });

    expect(res.status).toBe(401);
    expect(await prisma.approval.count({ where: { requestId: request.id } })).toBe(0);
  });

  it("deixa o comprador criar, que é quem roteia a alçada", async () => {
    const { request, aprovador, comprador } = await cenarioDeCriacao();
    session.current = { user: { id: comprador.id, roles: ["COMPRADOR"], canViewBoard: true } };

    const res = await POST(postRequest({ approverId: aprovador.id }), { params: { id: request.id } });

    expect(res.status).toBe(201);
    expect(await prisma.approval.count({ where: { requestId: request.id } })).toBe(1);
  });
});

/**
 * A alçada é o controle financeiro central do produto, e tinha dois furos que
 * não eram de autenticação e por isso não apareceram na primeira auditoria.
 *
 * 1. O nível saía do valor ESTIMADO declarado na Triagem e nunca era
 *    reconferido contra o que a empresa vai pagar de fato.
 * 2. A tabela de aprovadores por alçada estava com ZERO linhas nos três
 *    níveis, o que fazia do caminho manual o único existente: o comprador
 *    escolhia quem aprova a própria compra.
 */
describe("Alçada: de onde sai o nível e o que acontece sem pool", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    session.current = null;
  });

  function postRequest(body: unknown) {
    return new NextRequest("http://localhost/api/requests/x/aprovacao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  /** Solicitação em APROVACAO, com conflito declarado e sem conflito. */
  async function pronta(estimado: number, negociado?: number) {
    const requester = await createTestUser([]);
    const gestor = await createTestUser(["APROVADOR"]);
    const comprador = await createTestUser(["COMPRADOR"]);
    const cc = await createTestCostCenter();
    const request = await createTestRequest({
      requesterId: requester.id, approverManagerId: gestor.id, costCenterId: cc.id,
      currentStage: "APROVACAO", estimatedValue: estimado,
    });
    await prisma.conflictOfInterestDeclaration.create({
      data: { requestId: request.id, declaredBy: requester.id, hasConflict: false },
    });
    if (negociado !== undefined) {
      await prisma.quote.create({
        data: {
          requestId: request.id, supplierName: "Fornecedor de teste",
          initialValue: estimado, negotiatedValue: negociado,
          paymentCondition: "30 dias", selected: true,
        },
      });
    }
    return { request, comprador };
  }

  it("usa a cotação vencedora, e não o estimado, para definir o nível", async () => {
    // Estimado de R$ 40 mil cairia no Nível 1, com uma assinatura só. A
    // cotação vencedora de R$ 700 mil é Nível 3, que exige duas.
    const { request, comprador } = await pronta(40000, 700000);
    const a = await createTestUser(["APROVADOR"]);
    const b = await createTestUser(["APROVADOR"]);
    session.current = { user: { id: comprador.id, roles: ["COMPRADOR"], canViewBoard: true } };

    const res = await POST(postRequest({ approverIds: [a.id, b.id] }), { params: { id: request.id } });

    expect(res.status).toBe(201);
    const criadas = await prisma.approval.findMany({ where: { requestId: request.id } });
    expect(criadas).toHaveLength(2);
    expect(criadas[0].level).toBe(3);
  });

  it("sem cotação vencedora, continua usando o valor estimado", async () => {
    const { request, comprador } = await pronta(700000);
    const a = await createTestUser(["APROVADOR"]);
    const b = await createTestUser(["APROVADOR"]);
    session.current = { user: { id: comprador.id, roles: ["COMPRADOR"], canViewBoard: true } };

    const res = await POST(postRequest({ approverIds: [a.id, b.id] }), { params: { id: request.id } });

    expect(res.status).toBe(201);
    expect((await prisma.approval.findFirst({ where: { requestId: request.id } }))?.level).toBe(3);
  });

  it("em produção, recusa criar aprovação sem aprovadores configurados na alçada", async () => {
    vi.stubEnv("APP_ENV", "producao");
    const { request, comprador } = await pronta(700000);
    const a = await createTestUser(["APROVADOR"]);
    const b = await createTestUser(["APROVADOR"]);
    session.current = { user: { id: comprador.id, roles: ["COMPRADOR"], canViewBoard: true } };

    const res = await POST(postRequest({ approverIds: [a.id, b.id] }), { params: { id: request.id } });

    expect(res.status).toBe(422);
    expect(JSON.stringify(await res.json())).toContain("não tem aprovadores configurados");
    expect(await prisma.approval.count({ where: { requestId: request.id } })).toBe(0);
  });

  it("fora de produção o caminho manual continua, senão não dá para exercitar no Sandbox", async () => {
    vi.stubEnv("APP_ENV", "sandbox");
    const { request, comprador } = await pronta(10000);
    const a = await createTestUser(["APROVADOR"]);
    session.current = { user: { id: comprador.id, roles: ["COMPRADOR"], canViewBoard: true } };

    const res = await POST(postRequest({ approverId: a.id }), { params: { id: request.id } });

    expect(res.status).toBe(201);
  });
});
