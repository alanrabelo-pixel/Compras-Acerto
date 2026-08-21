import { describe, it, expect, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createTestUser, createTestCostCenter, createTestRequest, cleanupTestData, TEST_PREFIX } from "@/test-helpers/fixtures";

/**
 * Busca global (Ctrl+K).
 *
 * Este arquivo nasceu de um relato: "tentei buscar centro de custo, não
 * retornou nada". Era verdade, e não era um bug de consulta: a busca só
 * olhava código/descrição/solicitante das solicitações e fornecedor/CNPJ dos
 * contratos. Todo o resto do sistema devolvia lista vazia, indistinguível de
 * "não existe", que é a pior forma de falhar num campo de busca.
 *
 * A regra passou a ser: o campo acha qualquer coisa que o sistema guarda. Cada
 * caso aqui é um tipo que antes não era encontrado.
 */

vi.mock("@/lib/integrations/gmail", () => ({
  sendPurchaseEmail: async () => {},
  templates: { confirmacaoRecebimento: () => ({ subject: "s", html: "h" }), atualizacaoEtapa: () => ({ subject: "s", html: "h" }), reprovado: () => ({ subject: "s", html: "h" }) },
}));
vi.mock("@/lib/integrations/slack", () => ({ sendSlackDM: async () => {} }));

const { GET } = await import("./route");

afterAll(async () => {
  await prisma.simpleTicket.deleteMany({ where: { code: { contains: TEST_PREFIX } } });
  await prisma.supplier.deleteMany({ where: { legalName: { contains: TEST_PREFIX } } });
  await cleanupTestData();
});

async function buscar(q: string) {
  const res = await GET(new NextRequest(`http://localhost/api/search?q=${encodeURIComponent(q)}`));
  expect(res.status).toBe(200);
  return (await res.json()) as { type: string; title: string; href: string }[];
}

describe("busca global: acha o sistema inteiro", () => {
  it("acha CENTRO DE CUSTO, que era o caso relatado", async () => {
    const cc = await createTestCostCenter();

    const achados = await buscar(cc.name);

    const centro = achados.find((r) => r.type === "centro-de-custo");
    expect(centro).toBeDefined();
    expect(centro?.title).toBe(cc.name);
    // Leva ao quadro já filtrado: quem procura um centro de custo quer ver o
    // que está rodando nele, não a tela de cadastro.
    expect(centro?.href).toContain(`/solicitacoes?costCenterId=${cc.id}`);
  });

  it("acha PESSOA por nome e por e-mail", async () => {
    const pessoa = await createTestUser(["COMPRADOR"]);

    expect((await buscar(pessoa.name)).some((r) => r.type === "pessoa")).toBe(true);
    expect((await buscar(pessoa.email)).some((r) => r.type === "pessoa")).toBe(true);
  });

  it("acha FORNECEDOR por razão social e por CNPJ", async () => {
    const cnpj = `99${Date.now().toString().slice(-12)}`;
    await prisma.supplier.create({ data: { legalName: `Fornecedora ${TEST_PREFIX} Ltda`, cnpj } });

    expect((await buscar(`Fornecedora ${TEST_PREFIX}`)).some((r) => r.type === "fornecedor")).toBe(true);
    expect((await buscar(cnpj)).some((r) => r.type === "fornecedor")).toBe(true);
  });

  it("acha CHAMADO por código e por descrição", async () => {
    const ticket = await prisma.simpleTicket.create({
      data: {
        code: `VG-${TEST_PREFIX}-1`,
        category: "VIAGENS",
        requesterName: "Quem Pediu",
        requesterEmail: `${TEST_PREFIX}@exemplo.invalid`,
        description: `Reserva de hotel ${TEST_PREFIX} para o time`,
      },
    });

    const porCodigo = await buscar(ticket.code);
    const chamado = porCodigo.find((r) => r.type === "chamado");
    expect(chamado).toBeDefined();
    expect(chamado?.href).toBe(`/chamados/viagens/${ticket.id}`);

    expect((await buscar(`Reserva de hotel ${TEST_PREFIX}`)).some((r) => r.type === "chamado")).toBe(true);
  });

  it("acha SOLICITAÇÃO pelo nome do centro de custo dela, que antes não casava", async () => {
    const solicitante = await createTestUser([]);
    const gestor = await createTestUser(["APROVADOR"]);
    const cc = await createTestCostCenter();
    await createTestRequest({
      requesterId: solicitante.id,
      approverManagerId: gestor.id,
      costCenterId: cc.id,
      currentStage: "TRIAGEM",
      estimatedValue: 1000,
    });

    const achados = await buscar(cc.name);
    expect(achados.some((r) => r.type === "solicitacao")).toBe(true);
  });

  it("continua achando pelos campos antigos: código e solicitante", async () => {
    const solicitante = await createTestUser([]);
    const gestor = await createTestUser(["APROVADOR"]);
    const cc = await createTestCostCenter();
    const req = await createTestRequest({
      requesterId: solicitante.id,
      approverManagerId: gestor.id,
      costCenterId: cc.id,
      currentStage: "TRIAGEM",
      estimatedValue: 1000,
    });

    expect((await buscar(req.code)).some((r) => r.type === "solicitacao")).toBe(true);
    expect((await buscar(solicitante.name)).some((r) => r.type === "solicitacao")).toBe(true);
  });

  it("termo com menos de 2 caracteres não busca, para não varrer o banco a cada tecla", async () => {
    expect(await buscar("a")).toEqual([]);
  });

  it("termo sem correspondência devolve lista vazia, e não erro", async () => {
    expect(await buscar(`nada_com_esse_nome_${TEST_PREFIX}`)).toEqual([]);
  });
});
