import { describe, it, expect, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { PATCH } from "./route";
import { createTestUser, createTestCostCenter, createTestRequest, cleanupTestData } from "@/test-helpers/fixtures";

/**
 * O comprovante de aprovação do FP&A era exigido apenas no formulário. A API
 * criava a exceção orçamentária com attachmentId undefined e seguia, então uma
 * chamada direta, ou um upload que falhasse depois da criação da solicitação,
 * produzia exceção sem documento que a sustentasse.
 *
 * Junto disso, o campo extraBudget era lido da requisição e descartado: a
 * solicitação ficava sem linha de orçamento e sem nenhum registro de que era
 * extra-orçamentária, então nem havia como saber que o comprovante era devido.
 */

function patch(id: string, body: unknown) {
  return PATCH(
    new NextRequest("http://localhost/api/requests/x/validacao-orcamentaria", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { id } }
  );
}

async function solicitacaoExtraOrcamentaria(comAnexo: boolean) {
  const requester = await createTestUser([]);
  const gestor = await createTestUser(["APROVADOR"]);
  const costCenter = await createTestCostCenter();
  const req = await createTestRequest({
    requesterId: requester.id, approverManagerId: gestor.id, costCenterId: costCenter.id,
    currentStage: "VALIDACAO_ORCAMENTARIA", estimatedValue: 20000,
  });
  await prisma.purchaseRequest.update({ where: { id: req.id }, data: { extraBudget: true } });
  if (comAnexo) {
    await prisma.attachment.create({
      data: {
        requestId: req.id,
        category: "APROVACAO_EXTRA_ORCAMENTARIA",
        fileName: "aprovacao-fpa.pdf",
        storageUrl: "local://teste/aprovacao-fpa.pdf",
        uploadedBy: requester.id,
      },
    });
  }
  return req;
}

describe("Orçamento Extra: comprovante do FP&A", () => {
  afterAll(async () => {
    await cleanupTestData();
  });

  it("recusa abrir a exceção sem o comprovante anexado", async () => {
    const comprador = await createTestUser(["COMPRADOR"]);
    const req = await solicitacaoExtraOrcamentaria(false);

    const res = await patch(req.id, { actorId: comprador.id, budgetOk: false });

    expect(res.status).toBe(422);
    const corpo = await res.json();
    expect(corpo.error).toContain("FP&A");

    // O que mais importa: nenhuma exceção sem documento chegou ao banco.
    const excecao = await prisma.budgetException.findUnique({ where: { requestId: req.id } });
    expect(excecao).toBeNull();
  });

  it("permite abrir a exceção com o comprovante, e vincula o anexo", async () => {
    const comprador = await createTestUser(["COMPRADOR"]);
    const req = await solicitacaoExtraOrcamentaria(true);

    const res = await patch(req.id, { actorId: comprador.id, budgetOk: false });

    expect(res.status).toBe(200);
    const excecao = await prisma.budgetException.findUnique({ where: { requestId: req.id } });
    expect(excecao).not.toBeNull();
    expect(excecao?.attachmentId, "o comprovante precisa ficar vinculado à exceção").not.toBeNull();
  });

  it("não exige comprovante de quem informou linha de orçamento", async () => {
    // Só quem abriu como Orçamento Extra deve o documento. Exigir de todos
    // travaria o fluxo normal de quem tem linha de orçamento e apenas não tem
    // saldo naquele mês.
    const comprador = await createTestUser(["COMPRADOR"]);
    const requester = await createTestUser([]);
    const gestor = await createTestUser(["APROVADOR"]);
    const costCenter = await createTestCostCenter();
    const req = await createTestRequest({
      requesterId: requester.id, approverManagerId: gestor.id, costCenterId: costCenter.id,
      currentStage: "VALIDACAO_ORCAMENTARIA", estimatedValue: 20000,
    });

    const res = await patch(req.id, { actorId: comprador.id, budgetOk: false });

    expect(res.status).toBe(200);
  });
});
