import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createTestUser, createTestCostCenter, createTestRequest, cleanupTestData, TEST_PREFIX } from "@/test-helpers/fixtures";

/**
 * Regressão das LEITURAS por solicitação.
 *
 * Estes cinco GET não tinham autorização nenhuma além do middleware, que só
 * exige uma sessão @acerto.com.br. Com o id da solicitação na mão (ele aparece
 * na URL de qualquer tela e circula em link e em e-mail), qualquer conta da
 * empresa lia a lista de anexos, as cotações com valor negociado por
 * fornecedor, as declarações de conflito de interesse, o histórico de análises
 * de IA e baixava o PDF do Pedido de Compra inteiro, com CNPJ, contato e preço
 * unitário do fornecedor. Nada disso é público dentro da Acerto.
 *
 * Um arquivo só para o grupo, e não um por rota, de propósito: o Vitest roda
 * arquivos em paralelo contra o mesmo Postgres de desenvolvimento, e cinco
 * arquivos criando e limpando fixtures ao mesmo tempo é disputa desnecessária.
 * Aqui é um processo, um cenário, uma limpeza.
 *
 * Por que separado dos route.test.ts vizinhos: a suíte roda com
 * LOCAL_BYPASS_AUTH="true" (vem do .env via vitest.config.ts), e essa flag faz
 * as guardas de src/lib/acesso.ts liberarem tudo. Um teste de autorização
 * escrito naquele arquivo passaria sem exercer nada. Aqui a flag é desligada e
 * getServerSession é mockado, que é o caminho real de produção.
 */

type SessaoFalsa = {
  user: { id?: string; email?: string | null; roles?: string[]; canViewBoard?: boolean };
} | null;

const session = vi.hoisted(() => ({ current: null as SessaoFalsa }));

vi.mock("next-auth", () => ({
  getServerSession: async () => session.current,
}));

const { GET: getAiInsight } = await import("./ai-insight/route");
const { GET: getAttachments } = await import("./attachments/route");
const { GET: getConflito } = await import("./conflito-interesse/route");
const { GET: getCotacao } = await import("./cotacao/route");
const { GET: getPedidoCompraPdf } = await import("./pedido-compra/pdf/route");

type Handler = (req: NextRequest, ctx: { params: { id: string } }) => Promise<Response>;

const ROTAS: { nome: string; handler: Handler }[] = [
  { nome: "ai-insight", handler: getAiInsight as Handler },
  { nome: "attachments", handler: getAttachments as Handler },
  { nome: "conflito-interesse", handler: getConflito as Handler },
  { nome: "cotacao", handler: getCotacao as Handler },
  { nome: "pedido-compra/pdf", handler: getPedidoCompraPdf as Handler },
];

function getRequest(id: string, caminho: string) {
  return new NextRequest(`http://localhost/api/requests/${id}/${caminho}`, { method: "GET" });
}

/**
 * Monta a sessão do jeito que o callback session() de src/lib/auth.ts monta em
 * produção: id, papéis e canViewBoard vêm das colunas do banco a cada
 * chamada, e uma pessoa desativada sai sem id. Escrever o objeto na mão em
 * cada teste deixaria passar um cenário que a produção nunca produz, e é o
 * caminho fácil para um teste que "passa" concordando com ele mesmo.
 */
async function sessaoDe(userId: string): Promise<SessaoFalsa> {
  const dbUser = await prisma.user.findUnique({ where: { id: userId }, include: { roles: true } });
  if (!dbUser || !dbUser.active) {
    return { user: { id: undefined, email: dbUser?.email, roles: [], canViewBoard: false } };
  }
  return {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      roles: dbUser.roles.map((r) => r.role),
      canViewBoard: dbUser.canViewBoard,
    },
  };
}

/**
 * Uma solicitação com conteúdo de verdade em cada uma das cinco leituras, para
 * que o caso "parte legítima passa" prove que a resposta traz o dado, e não que
 * a rota devolveu lista vazia por acaso.
 *
 * `solicitante` não tem papel nenhum e canViewBoard falso: é parte na
 * solicitação e nada além disso, que é exatamente o recorte que a guarda
 * precisa deixar passar. `intruso` tem SOLICITANTE, papel que não liga
 * canViewBoard, e não é parte em nada.
 */
async function cenario() {
  const solicitante = await createTestUser([]);
  const gestor = await createTestUser(["APROVADOR"]);
  const intruso = await createTestUser(["SOLICITANTE"]);
  const costCenter = await createTestCostCenter();
  const solicitacao = await createTestRequest({
    requesterId: solicitante.id,
    approverManagerId: gestor.id,
    costCenterId: costCenter.id,
    currentStage: "PEDIDO_COMPRA",
    estimatedValue: 120000,
  });

  await prisma.quote.create({
    data: {
      requestId: solicitacao.id,
      supplierName: "Fornecedor Sigiloso Ltda",
      initialValue: 130000,
      negotiatedValue: 120000,
      paymentCondition: "30 dias",
    },
  });
  await prisma.attachment.create({
    data: {
      requestId: solicitacao.id,
      fileName: "proposta-confidencial.pdf",
      storageUrl: "/uploads/teste/proposta-confidencial.pdf",
      uploadedBy: solicitante.id,
      stage: "COTACAO",
      category: "GERAL",
    },
  });
  await prisma.conflictOfInterestDeclaration.create({
    data: { requestId: solicitacao.id, declaredBy: solicitante.id, hasConflict: true, details: "Primo é sócio." },
  });
  await prisma.aiInsight.create({
    data: { requestId: solicitacao.id, stage: "COTACAO", requestedById: solicitante.id, anthropicModel: "teste" },
  });
  const pedido = await prisma.purchaseOrder.create({
    data: {
      requestId: solicitacao.id,
      supplierLegalName: "Fornecedor Sigiloso Ltda",
      supplierCnpj: "00000000000191",
      contactName: "Contato Teste",
      contactPhone: "31999999999",
      contactEmail: "contato@fornecedorsigiloso.com.br",
      initialValue: 130000,
      negotiatedValue: 120000,
      paymentCondition: "30 dias",
      installments: 1,
      prazoEntrega: "10 dias úteis",
      localEntrega: "Rua Teste, 123",
    },
  });
  await prisma.purchaseOrderItem.create({
    data: {
      purchaseOrderId: pedido.id,
      descricao: "Item sigiloso",
      quantidade: 1,
      valorUnitario: 120000,
      impostosPercent: 0,
      valorTotal: 120000,
    },
  });

  return { solicitacao, solicitante, gestor, intruso };
}

describe("Leituras por solicitação: autorização", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    session.current = null;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    // cleanupTestData() não cobre Quote, AiInsight nem Attachment, e os três
    // têm FK para PurchaseRequest: sem apagá-los antes, o deleteMany de
    // solicitações dela estoura. O filtro é pelo TEST_PREFIX deste módulo, para
    // não encostar no que outro arquivo de teste estiver criando em paralelo no
    // mesmo banco de desenvolvimento.
    const criadas = await prisma.purchaseRequest.findMany({
      where: { code: { contains: TEST_PREFIX } },
      select: { id: true },
    });
    const ids = criadas.map((r) => r.id);
    if (ids.length > 0) {
      await prisma.quote.deleteMany({ where: { requestId: { in: ids } } });
      await prisma.aiInsight.deleteMany({ where: { requestId: { in: ids } } });
      await prisma.attachment.deleteMany({ where: { requestId: { in: ids } } });
    }
    await cleanupTestData();
  });

  for (const rota of ROTAS) {
    describe(`GET /api/requests/[id]/${rota.nome}`, () => {
      it("recusa com 403 quem não é parte e não vê o quadro", async () => {
        const { solicitacao, intruso } = await cenario();
        session.current = await sessaoDe(intruso.id);

        const res = await rota.handler(getRequest(solicitacao.id, rota.nome), {
          params: { id: solicitacao.id },
        });

        expect(res.status).toBe(403);
        // Nada do conteúdo pode ter vazado junto com a recusa.
        const corpo = await res.text();
        expect(corpo).not.toContain("Fornecedor Sigiloso");
        expect(corpo).not.toContain("proposta-confidencial");
      });

      it("recusa com 401 quando não há sessão nenhuma", async () => {
        const { solicitacao } = await cenario();
        session.current = null;

        const res = await rota.handler(getRequest(solicitacao.id, rota.nome), {
          params: { id: solicitacao.id },
        });

        expect(res.status).toBe(401);
      });

      it("deixa passar o solicitante, que é parte mesmo sem acesso ao quadro", async () => {
        const { solicitacao, solicitante } = await cenario();
        session.current = await sessaoDe(solicitante.id);

        const res = await rota.handler(getRequest(solicitacao.id, rota.nome), {
          params: { id: solicitacao.id },
        });

        expect(res.status).toBe(200);
      }, 30000);
    });
  }

  it("deixa passar quem vê o quadro sem ser parte, no caso mais sensível (PDF do Pedido de Compra)", async () => {
    const { solicitacao } = await cenario();
    const controladoria = await createTestUser(["CONTROLADORIA"]);
    // veQuadro sai da COLUNA canViewBoard, não do papel (ver atorDaSessao em
    // src/lib/acesso.ts), então o papel sozinho não bastaria aqui.
    await prisma.user.update({ where: { id: controladoria.id }, data: { canViewBoard: true } });
    session.current = await sessaoDe(controladoria.id);

    const res = await getPedidoCompraPdf(getRequest(solicitacao.id, "pedido-compra/pdf"), {
      params: { id: solicitacao.id },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  }, 30000);

  it("recusa com 401 quem foi desativado, ainda que seja o solicitante", async () => {
    const { solicitacao, solicitante } = await cenario();
    await prisma.user.update({ where: { id: solicitante.id }, data: { active: false } });
    session.current = await sessaoDe(solicitante.id);

    const res = await getAttachments(getRequest(solicitacao.id, "attachments"), {
      params: { id: solicitacao.id },
    });

    expect(res.status).toBe(401);
  });
});
