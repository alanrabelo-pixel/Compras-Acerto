import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createTestUser, createTestCostCenter, createTestRequest, cleanupTestData, TEST_PREFIX } from "@/test-helpers/fixtures";

/**
 * Autorização dos handlers por solicitação: chat, histórico do fornecedor,
 * anexo, avaliação e declaração de conflito de interesse.
 *
 * Duas falhas diferentes moram aqui, e as duas eram exploráveis só com o id da
 * solicitação, que aparece na URL de qualquer tela e circula em link e e-mail:
 *
 * 1. LEITURA sem recorte. Qualquer conta @acerto.com.br lia a conversa entre
 *    comprador e solicitante e consultava quanto a Acerto já comprou daquele
 *    fornecedor nos últimos 12 meses.
 *
 * 2. IDENTIDADE vinda do CORPO. authorRole/authorName, uploadedBy e declaredBy
 *    eram aceitos como o cliente mandasse, então dava para escrever no chat
 *    como COMPRADOR com o nome que quisesse (e o texto ainda era espelhado em
 *    DM no Slack para a outra parte), anexar arquivo assinando com o id de
 *    outra pessoa e declarar "sem conflito" no nome de quem tem o conflito. A
 *    avaliação era o caso inverso: não tinha autor nenhum no corpo, e por isso
 *    qualquer um do quadro gravava a nota do solicitante por cima.
 *
 * Um arquivo para o grupo inteiro, e não um por rota: o Vitest roda arquivos em
 * paralelo contra o mesmo Postgres de desenvolvimento, e cinco arquivos criando
 * e limpando fixtures ao mesmo tempo é disputa desnecessária.
 *
 * Por que separado dos route.test.ts vizinhos: a suíte roda com
 * LOCAL_BYPASS_AUTH="true" (vem do .env via vitest.config.ts), e essa flag faz
 * as guardas de src/lib/acesso.ts liberarem tudo. Um teste de autorização
 * escrito lá passaria sem exercer nada. Aqui a flag é desligada e
 * getServerSession é mockado, que é o caminho real de produção.
 */

type SessaoFalsa = {
  user: { id?: string; email?: string | null; roles?: string[]; canViewBoard?: boolean };
} | null;

const session = vi.hoisted(() => ({ current: null as SessaoFalsa }));

vi.mock("next-auth", () => ({
  getServerSession: async () => session.current,
}));

// O .env local tem SLACK_BOT_TOKEN de verdade, e o POST do chat espelha a
// mensagem em DM. Sem este mock o teste bateria no Slack com e-mails de
// fixture. createAppChatMessage já trata a falha em silêncio (é o mesmo
// caminho de quem não tem Slack), então o registro no app segue igual.
vi.mock("@/lib/integrations/slack", () => ({
  sendSlackThreadDM: async () => {
    throw new Error("Slack desligado neste teste.");
  },
}));

// O upload real grava em uploads/ no disco do projeto. O que está sob teste é
// quem pode anexar e com que identidade, não o armazenamento.
vi.mock("@/lib/storage", () => ({
  saveFile: async (requestId: string, fileName: string) => `local://${requestId}/${fileName}`,
  readFile: async () => Buffer.from(""),
}));

const { GET: getChat, POST: postChat } = await import("./chat/route");
const { GET: getSupplierHistory } = await import("./supplier-history/route");
const { POST: postAnexo } = await import("./attachments/route");
const { POST: postAvaliacao } = await import("./avaliacao/route");
const { POST: postConflito } = await import("./conflito-interesse/route");

const FORNECEDOR = "Fornecedor Sigiloso Ltda";
const MENSAGEM_SIGILOSA = "Combinamos 120 mil com o Fornecedor Sigiloso, não comente fora daqui.";

function url(id: string, caminho: string) {
  return `http://localhost/api/requests/${id}/${caminho}`;
}

function get(id: string, caminho: string) {
  return new NextRequest(url(id, caminho), { method: "GET" });
}

function postJson(id: string, caminho: string, corpo: unknown) {
  return new NextRequest(url(id, caminho), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

function postAnexoDe(id: string, uploadedBy: string) {
  const form = new FormData();
  form.append("file", new File(["conteúdo de teste"], "proposta-confidencial.pdf", { type: "application/pdf" }));
  form.append("uploadedBy", uploadedBy);
  return new NextRequest(url(id, "attachments"), { method: "POST", body: form });
}

/**
 * Monta a sessão do jeito que o callback session() de src/lib/auth.ts monta em
 * produção: id, papéis e canViewBoard saem das colunas do banco a cada chamada,
 * e uma pessoa desativada sai sem id. Escrever o objeto na mão deixaria passar
 * um cenário que a produção nunca produz.
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
 * `solicitante` não tem papel nenhum e canViewBoard falso: é parte na
 * solicitação e nada além disso. `comprador` é o buyer, e o papel COMPRADOR já
 * liga veQuadro. `gestor` é o aprovador do registro: PASSA na leitura (APROVADOR
 * vê o quadro) e por isso é o caso que prova a checagem extra da avaliação, que
 * não é sobre ler e sim sobre ser o dono da nota. `intruso` tem SOLICITANTE,
 * papel que não liga veQuadro, e não é parte em nada.
 *
 * A etapa é CONCLUIDO porque é o que a avaliação exige, e porque CONCLUIDO não
 * está em PAPEIS_QUE_ATUAM_NA_ETAPA (src/lib/acesso.ts): ninguém entra por
 * etapa, o recorte fica sendo só quadro e parte.
 */
async function cenario() {
  const solicitante = await createTestUser([]);
  const comprador = await createTestUser(["COMPRADOR"]);
  const gestor = await createTestUser(["APROVADOR"]);
  const intruso = await createTestUser(["SOLICITANTE"]);
  const costCenter = await createTestCostCenter();
  const solicitacao = await createTestRequest({
    requesterId: solicitante.id,
    approverManagerId: gestor.id,
    buyerId: comprador.id,
    costCenterId: costCenter.id,
    currentStage: "CONCLUIDO",
    estimatedValue: 120000,
  });

  await prisma.purchaseRequest.update({
    where: { id: solicitacao.id },
    data: { indicatedSupplierName: FORNECEDOR },
  });
  await prisma.requestChatMessage.create({
    data: {
      requestId: solicitacao.id,
      authorRole: "COMPRADOR",
      authorName: "Comprador Teste",
      body: MENSAGEM_SIGILOSA,
      source: "APP",
    },
  });
  // Pedido de Compra com o mesmo nome de fornecedor: é o que faz o
  // supplier-history somar algo em vez de devolver zero, para o caso "parte
  // legítima passa" provar que a resposta traz o dado.
  await prisma.purchaseOrder.create({
    data: {
      requestId: solicitacao.id,
      supplierLegalName: FORNECEDOR,
      supplierCnpj: "00000000000191",
      contactName: "Contato Teste",
      contactPhone: "31999999999",
      contactEmail: "contato@fornecedorsigiloso.com.br",
      initialValue: 130000,
      negotiatedValue: 120000,
      paymentCondition: "30 dias",
      installments: 1,
    },
  });

  return { solicitacao, solicitante, comprador, gestor, intruso };
}

describe("Handlers por solicitação: autorização e identidade", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    session.current = null;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    // cleanupTestData() não conhece RequestChatMessage, Attachment nem
    // SupplierEvaluation, e os três têm FK para PurchaseRequest: sem apagá-los
    // antes, o deleteMany de solicitações estoura. O filtro é pelo TEST_PREFIX
    // deste módulo, para não encostar no que outro arquivo estiver criando em
    // paralelo no mesmo banco de desenvolvimento.
    const criadas = await prisma.purchaseRequest.findMany({
      where: { code: { contains: TEST_PREFIX } },
      select: { id: true },
    });
    const ids = criadas.map((r) => r.id);
    if (ids.length > 0) {
      await prisma.requestChatMessage.deleteMany({ where: { requestId: { in: ids } } });
      await prisma.attachment.deleteMany({ where: { requestId: { in: ids } } });
      await prisma.supplierEvaluation.deleteMany({ where: { requestId: { in: ids } } });
    }
    await cleanupTestData();
  });

  describe("GET /api/requests/[id]/chat", () => {
    it("recusa com 403 quem não é parte e não vê o quadro, sem vazar a conversa", async () => {
      const { solicitacao, intruso } = await cenario();
      session.current = await sessaoDe(intruso.id);

      const res = await getChat(get(solicitacao.id, "chat"), { params: { id: solicitacao.id } });

      expect(res.status).toBe(403);
      expect(await res.text()).not.toContain("Sigiloso");
    });

    it("recusa com 401 quando não há sessão nenhuma", async () => {
      const { solicitacao } = await cenario();

      const res = await getChat(get(solicitacao.id, "chat"), { params: { id: solicitacao.id } });

      expect(res.status).toBe(401);
    });

    it("deixa o solicitante ler a própria conversa mesmo sem acesso ao quadro", async () => {
      const { solicitacao, solicitante } = await cenario();
      session.current = await sessaoDe(solicitante.id);

      const res = await getChat(get(solicitacao.id, "chat"), { params: { id: solicitacao.id } });

      expect(res.status).toBe(200);
      const { messages } = (await res.json()) as { messages: { body: string }[] };
      expect(messages.map((m) => m.body)).toContain(MENSAGEM_SIGILOSA);
    });
  });

  describe("POST /api/requests/[id]/chat", () => {
    it("recusa com 403 quem não é parte e não escreve nada", async () => {
      const { solicitacao, intruso } = await cenario();
      session.current = await sessaoDe(intruso.id);

      const res = await postChat(
        postJson(solicitacao.id, "chat", { authorRole: "COMPRADOR", authorName: "Compras Acerto", body: "Pode pagar." }),
        { params: { id: solicitacao.id } }
      );

      expect(res.status).toBe(403);
      const total = await prisma.requestChatMessage.count({ where: { requestId: solicitacao.id } });
      expect(total).toBe(1); // só a mensagem do cenário
    });

    it("recusa com 401 quando não há sessão nenhuma", async () => {
      const { solicitacao } = await cenario();

      const res = await postChat(
        postJson(solicitacao.id, "chat", { authorRole: "SOLICITANTE", authorName: "Alguém", body: "Oi." }),
        { params: { id: solicitacao.id } }
      );

      expect(res.status).toBe(401);
    });

    it("ignora authorRole e authorName do corpo: quem escreve é quem está na sessão", async () => {
      const { solicitacao, solicitante } = await cenario();
      session.current = await sessaoDe(solicitante.id);

      const res = await postChat(
        postJson(solicitacao.id, "chat", {
          // O widget deixa a própria pessoa escolher o lado da conversa, então
          // este corpo é o que um solicitante consegue enviar hoje.
          authorRole: "COMPRADOR",
          authorName: "Compras Acerto",
          body: "Aprovado, pode seguir com o pagamento.",
        }),
        { params: { id: solicitacao.id } }
      );

      expect(res.status).toBe(201);
      const { message } = (await res.json()) as { message: { authorRole: string; authorName: string } };
      expect(message.authorRole).toBe("SOLICITANTE");
      expect(message.authorName).toBe(solicitante.name);
      expect(message.authorName).not.toBe("Compras Acerto");
    });

    it("assina como COMPRADOR quem de fato é o comprador da solicitação", async () => {
      const { solicitacao, comprador } = await cenario();
      session.current = await sessaoDe(comprador.id);

      const res = await postChat(
        postJson(solicitacao.id, "chat", { authorRole: "SOLICITANTE", authorName: "Outra Pessoa", body: "Segue a cotação." }),
        { params: { id: solicitacao.id } }
      );

      expect(res.status).toBe(201);
      const { message } = (await res.json()) as { message: { authorRole: string; authorName: string } };
      expect(message.authorRole).toBe("COMPRADOR");
      expect(message.authorName).toBe(comprador.name);
    });
  });

  describe("GET /api/requests/[id]/supplier-history", () => {
    it("recusa com 403 quem não é parte e não vê o quadro, sem vazar o fornecedor", async () => {
      const { solicitacao, intruso } = await cenario();
      session.current = await sessaoDe(intruso.id);

      const res = await getSupplierHistory(get(solicitacao.id, "supplier-history"), {
        params: { id: solicitacao.id },
      });

      expect(res.status).toBe(403);
      expect(await res.text()).not.toContain("Sigiloso");
    });

    it("recusa com 401 quando não há sessão nenhuma", async () => {
      const { solicitacao } = await cenario();

      const res = await getSupplierHistory(get(solicitacao.id, "supplier-history"), {
        params: { id: solicitacao.id },
      });

      expect(res.status).toBe(401);
    });

    it("deixa passar o comprador da solicitação, com o total de fato somado", async () => {
      const { solicitacao, comprador } = await cenario();
      session.current = await sessaoDe(comprador.id);

      const res = await getSupplierHistory(get(solicitacao.id, "supplier-history"), {
        params: { id: solicitacao.id },
      });

      expect(res.status).toBe(200);
      const dados = (await res.json()) as { sum: number; matchedSupplierName: string | null };
      expect(dados.sum).toBeGreaterThan(0);
      expect(dados.matchedSupplierName).toBe(FORNECEDOR);
    });
  });

  describe("POST /api/requests/[id]/attachments", () => {
    it("recusa com 403 quem não é parte e não grava anexo nenhum", async () => {
      const { solicitacao, intruso } = await cenario();
      session.current = await sessaoDe(intruso.id);

      const res = await postAnexo(postAnexoDe(solicitacao.id, intruso.id), { params: { id: solicitacao.id } });

      expect(res.status).toBe(403);
      const total = await prisma.attachment.count({ where: { requestId: solicitacao.id } });
      expect(total).toBe(0);
    });

    it("recusa com 401 quando não há sessão nenhuma", async () => {
      const { solicitacao, solicitante } = await cenario();

      const res = await postAnexo(postAnexoDe(solicitacao.id, solicitante.id), { params: { id: solicitacao.id } });

      expect(res.status).toBe(401);
    });

    it("ignora uploadedBy do corpo: o anexo fica assinado por quem está na sessão", async () => {
      const { solicitacao, solicitante, comprador } = await cenario();
      session.current = await sessaoDe(solicitante.id);

      // Corpo tenta creditar o upload ao comprador.
      const res = await postAnexo(postAnexoDe(solicitacao.id, comprador.id), { params: { id: solicitacao.id } });

      expect(res.status).toBe(201);
      const anexo = (await res.json()) as { id: string; uploadedBy: string };
      expect(anexo.uploadedBy).toBe(solicitante.id);
      const gravado = await prisma.attachment.findUnique({ where: { id: anexo.id } });
      expect(gravado?.uploadedBy).toBe(solicitante.id);
    });
  });

  describe("POST /api/requests/[id]/avaliacao", () => {
    it("recusa com 403 quem não é parte", async () => {
      const { solicitacao, intruso } = await cenario();
      session.current = await sessaoDe(intruso.id);

      const res = await postAvaliacao(postJson(solicitacao.id, "avaliacao", { score: 10 }), {
        params: { id: solicitacao.id },
      });

      expect(res.status).toBe(403);
      expect(await prisma.supplierEvaluation.count({ where: { requestId: solicitacao.id } })).toBe(0);
    });

    it("recusa com 403 o aprovador do registro, que lê a solicitação mas não é o dono da nota", async () => {
      const { solicitacao, gestor } = await cenario();
      session.current = await sessaoDe(gestor.id);

      const res = await postAvaliacao(postJson(solicitacao.id, "avaliacao", { score: 10, feedback: "Tudo ótimo." }), {
        params: { id: solicitacao.id },
      });

      expect(res.status).toBe(403);
      expect(await prisma.supplierEvaluation.count({ where: { requestId: solicitacao.id } })).toBe(0);
    });

    it("recusa com 401 quando não há sessão nenhuma", async () => {
      const { solicitacao } = await cenario();

      const res = await postAvaliacao(postJson(solicitacao.id, "avaliacao", { score: 10 }), {
        params: { id: solicitacao.id },
      });

      expect(res.status).toBe(401);
    });

    it("deixa o solicitante avaliar a própria compra", async () => {
      const { solicitacao, solicitante } = await cenario();
      session.current = await sessaoDe(solicitante.id);

      const res = await postAvaliacao(postJson(solicitacao.id, "avaliacao", { score: 9, feedback: "Rápido." }), {
        params: { id: solicitacao.id },
      });

      expect(res.status).toBe(201);
      const avaliacao = await prisma.supplierEvaluation.findUnique({ where: { requestId: solicitacao.id } });
      expect(avaliacao?.score).toBe(9);
    });
  });

  describe("POST /api/requests/[id]/conflito-interesse", () => {
    it("recusa com 403 quem não é parte e não registra declaração", async () => {
      const { solicitacao, intruso, comprador } = await cenario();
      session.current = await sessaoDe(intruso.id);

      const res = await postConflito(
        postJson(solicitacao.id, "conflito-interesse", { declaredBy: comprador.id, hasConflict: false }),
        { params: { id: solicitacao.id } }
      );

      expect(res.status).toBe(403);
      expect(await prisma.conflictOfInterestDeclaration.count({ where: { requestId: solicitacao.id } })).toBe(0);
    });

    it("recusa com 401 quando não há sessão nenhuma", async () => {
      const { solicitacao, comprador } = await cenario();

      const res = await postConflito(
        postJson(solicitacao.id, "conflito-interesse", { declaredBy: comprador.id, hasConflict: false }),
        { params: { id: solicitacao.id } }
      );

      expect(res.status).toBe(401);
    });

    it("ignora declaredBy do corpo: a declaração fica no nome de quem está na sessão", async () => {
      const { solicitacao, solicitante, comprador } = await cenario();
      session.current = await sessaoDe(solicitante.id);

      // Corpo tenta declarar "sem conflito" no nome do comprador.
      const res = await postConflito(
        postJson(solicitacao.id, "conflito-interesse", { declaredBy: comprador.id, hasConflict: false }),
        { params: { id: solicitacao.id } }
      );

      expect(res.status).toBe(201);
      const declaracao = (await res.json()) as { declaredBy: string };
      expect(declaracao.declaredBy).toBe(solicitante.id);
      expect(declaracao.declaredBy).not.toBe(comprador.id);
    });
  });
});
