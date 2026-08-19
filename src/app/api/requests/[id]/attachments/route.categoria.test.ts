import { describe, it, expect, afterAll } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { POST } from "./route";
import { createTestUser, createTestCostCenter, createTestRequest, cleanupTestData } from "@/test-helpers/fixtures";

/**
 * A rota de upload fazia cast direto de `stage` e `category` para os enums do
 * Prisma, sem conferir se o valor existia. Qualquer texto vindo do formulário
 * chegava ao banco e estourava lá, virando um 500 sem explicação para quem
 * anexou o arquivo. Agora valor desconhecido cai no padrão (GERAL / etapa
 * atual da solicitação) e o upload continua.
 *
 * O outro caso coberto aqui é a categoria nova, TRIAGEM_FORNECEDOR, usada
 * pela evidência opcional de triagem do fornecedor.
 */

async function enviar(requestId: string, uploaderId: string, campos: Record<string, string>) {
  const form = new FormData();
  form.append("file", new File(["conteudo de teste"], "evidencia.pdf", { type: "application/pdf" }));
  form.append("uploadedBy", uploaderId);
  for (const [chave, valor] of Object.entries(campos)) form.append(chave, valor);

  return POST(
    new NextRequest("http://localhost/api/requests/x/attachments", { method: "POST", body: form }),
    { params: { id: requestId } }
  );
}

// O upload grava o arquivo de verdade em uploads/<requestId>/ (storage local).
// Guardamos os ids para apagar essas pastas no fim, senão cada execução da
// suíte deixa lixo no repositório.
const pastasCriadas: string[] = [];

async function solicitacaoDeTeste() {
  const requester = await createTestUser([]);
  const gestor = await createTestUser(["APROVADOR"]);
  const costCenter = await createTestCostCenter();
  const req = await createTestRequest({
    requesterId: requester.id,
    approverManagerId: gestor.id,
    costCenterId: costCenter.id,
    currentStage: "PEDIDO_COMPRA",
  });
  pastasCriadas.push(req.id);
  return { req, requester };
}

describe("upload de anexo: categoria e etapa", () => {
  it("aceita a categoria de triagem do fornecedor", async () => {
    const { req, requester } = await solicitacaoDeTeste();
    const res = await enviar(req.id, requester.id, { category: "TRIAGEM_FORNECEDOR" });
    expect(res.status).toBe(201);

    const anexo = await prisma.attachment.findFirst({ where: { requestId: req.id } });
    expect(anexo?.category).toBe("TRIAGEM_FORNECEDOR");
  });

  it("cai em GERAL quando a categoria não existe, em vez de estourar", async () => {
    const { req, requester } = await solicitacaoDeTeste();
    const res = await enviar(req.id, requester.id, { category: "CATEGORIA_QUE_NAO_EXISTE" });
    expect(res.status).toBe(201);

    const anexo = await prisma.attachment.findFirst({ where: { requestId: req.id } });
    expect(anexo?.category).toBe("GERAL");
  });

  it("usa a etapa atual da solicitação quando a etapa informada não existe", async () => {
    const { req, requester } = await solicitacaoDeTeste();
    const res = await enviar(req.id, requester.id, { stage: "ETAPA_INVENTADA" });
    expect(res.status).toBe(201);

    const anexo = await prisma.attachment.findFirst({ where: { requestId: req.id } });
    expect(anexo?.stage).toBe("PEDIDO_COMPRA");
  });
});

afterAll(async () => {
  await cleanupTestData();
  for (const id of pastasCriadas) {
    await rm(path.join(process.cwd(), "uploads", id), { recursive: true, force: true });
  }
});
