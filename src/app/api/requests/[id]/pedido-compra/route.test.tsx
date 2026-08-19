import { describe, it, expect, afterAll } from "vitest";
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { POST } from "./route";
import { prisma } from "@/lib/db";
import { createTestUser, createTestCostCenter, createTestRequest, cleanupTestData } from "@/test-helpers/fixtures";

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/requests/x/pedido-compra", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const basePayload = {
  supplierLegalName: "Fornecedor Teste Ltda",
  supplierCnpj: "00.000.000/0001-00",
  contactName: "Contato Teste",
  contactPhone: "31999999999",
  contactEmail: "contato@fornecedorteste.com.br",
  initialValue: 10000,
  negotiatedValue: 9000,
  paymentCondition: "à vista",
  installments: 1,
  prazoEntrega: "10 dias úteis",
  localEntrega: "Rua Teste, 123",
  items: [{ descricao: "Item de teste", quantidade: 1, valorUnitario: 9000, impostosPercent: 0 }],
};

describe("POST /api/requests/[id]/pedido-compra", () => {
  const generatedCodes: string[] = [];

  afterAll(async () => {
    await cleanupTestData();
    for (const code of generatedCodes) {
      const pdfPath = path.join(process.cwd(), "public", "pedidos-compra", `${code}.pdf`);
      if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
    }
  });

  it("rejeita quando falta um campo obrigatório", async () => {
    const requester = await createTestUser([]);
    const buyer = await createTestUser(["COMPRADOR"]);
    const approver = await createTestUser(["APROVADOR"]);
    const costCenter = await createTestCostCenter();
    const request = await createTestRequest({
      requesterId: requester.id, approverManagerId: approver.id, buyerId: buyer.id, costCenterId: costCenter.id,
      currentStage: "PEDIDO_COMPRA",
    });
    generatedCodes.push(request.code);

    const { contactPhone: _omit, ...incomplete } = basePayload;
    const res = await POST(postRequest({ actorId: buyer.id, ...incomplete }), { params: { id: request.id } });
    const data = await res.json();

    expect(res.status).toBe(400);
    // A mensagem nomeia o campo como ele aparece no formulário, não pela chave
    // interna: quem está preenchendo a tela não reconhece "contactPhone".
    expect(data.error).toMatch(/Telefone do contato/);
    expect(data.error, "não deve vazar o nome interno do campo").not.toMatch(/contactPhone/);
  });

  it("rejeita quando o ator não tem papel Comprador", async () => {
    const requester = await createTestUser([]);
    const notBuyer = await createTestUser(["JURIDICO"]);
    const approver = await createTestUser(["APROVADOR"]);
    const costCenter = await createTestCostCenter();
    const request = await createTestRequest({
      requesterId: requester.id, approverManagerId: approver.id, costCenterId: costCenter.id,
      currentStage: "PEDIDO_COMPRA",
    });
    generatedCodes.push(request.code);

    const res = await POST(postRequest({ actorId: notBuyer.id, ...basePayload }), { params: { id: request.id } });

    expect(res.status).toBe(403);
  });

  it("gera o Pedido de Compra, o PDF e avança para Aguardando Entrega", async () => {
    const requester = await createTestUser([]);
    const buyer = await createTestUser(["COMPRADOR"]);
    const approver = await createTestUser(["APROVADOR"]);
    const costCenter = await createTestCostCenter();
    const request = await createTestRequest({
      requesterId: requester.id, approverManagerId: approver.id, buyerId: buyer.id, costCenterId: costCenter.id,
      currentStage: "PEDIDO_COMPRA",
    });
    generatedCodes.push(request.code);

    const res = await POST(postRequest({ actorId: buyer.id, ...basePayload }), { params: { id: request.id } });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.request.currentStage).toBe("AGUARDANDO_ENTREGA");
    // O PDF deixou de ser gravado em public/ com nome previsível, onde era
    // enumerável e sumia a cada deploy. Agora o link aponta para a rota que
    // regenera o documento a partir do banco e exige sessão.
    expect(data.purchaseOrder.pdfUrl).toBe(`/api/requests/${request.id}/pedido-compra/pdf`);

    const items = await prisma.purchaseOrderItem.findMany({ where: { purchaseOrderId: data.purchaseOrder.id } });
    expect(items).toHaveLength(1);
    expect(Number(items[0].valorTotal)).toBe(9000);

    const pdfPath = path.join(process.cwd(), "public", "pedidos-compra", `${request.code}.pdf`);
    expect(fs.existsSync(pdfPath), "não deve mais gravar arquivo estático em public/").toBe(false);
    // Prazo maior só aqui: este teste gera um PDF de verdade, registrando três
    // fontes TTF. Sozinho leva ~3s, mas sob a concorrência da suíte cheia
    // passava dos 5s padrão e falhava por timeout, sem nada de errado no
    // comportamento testado.
  }, 30000);

  it("rejeita quando nenhum item é informado", async () => {
    const requester = await createTestUser([]);
    const buyer = await createTestUser(["COMPRADOR"]);
    const approver = await createTestUser(["APROVADOR"]);
    const costCenter = await createTestCostCenter();
    const request = await createTestRequest({
      requesterId: requester.id, approverManagerId: approver.id, buyerId: buyer.id, costCenterId: costCenter.id,
      currentStage: "PEDIDO_COMPRA",
    });
    generatedCodes.push(request.code);

    const res = await POST(postRequest({ actorId: buyer.id, ...basePayload, items: [] }), { params: { id: request.id } });

    expect(res.status).toBe(400);
  });
});
