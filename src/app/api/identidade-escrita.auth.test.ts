import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createTestUser, createTestCostCenter, cleanupTestData, TEST_PREFIX } from "@/test-helpers/fixtures";

/**
 * Identidade em rotas de ESCRITA: quem age é quem está logado.
 *
 * Duas rotas liam do CORPO da requisição quem estava agindo e nunca
 * comparavam esse valor com a sessão:
 *
 * - POST /api/requests aceitava `requesterId`, então dava para abrir uma
 *   solicitação de compra em nome de outra pessoa. Ela nem precisava passar
 *   perto: a confirmação de recebimento (sendPurchaseEmail) chegava na caixa
 *   dela e o StageEvent de abertura registrava o nome dela como autora.
 * - POST /api/tickets/[id]/attachments não tinha autorização nenhuma: com o id
 *   de um chamado alheio, qualquer conta pendurava arquivo dentro dele.
 *
 * O padrão aplicado na primeira é sessão primeiro, corpo depois
 * (`ator?.id ?? idDoCorpo`). Trocar o corpo pela sessão e mais nada quebraria
 * o desenvolvimento local, que roda com LOCAL_BYPASS_AUTH e sem sessão
 * nenhuma, e por isso a queda para o corpo também é testada aqui: ela é parte
 * do comportamento, não uma brecha esquecida.
 *
 * POST /api/requests/suggest tinha o mesmo problema (carregava a CHAVE
 * PESSOAL de IA de quem o corpo escolhesse), mas deixou de existir em
 * 27/08/2026: a rota passou a usar a chave única da empresa, e não precisa
 * mais saber quem está pedindo (ver src/lib/integrations/ai.ts).
 *
 * Arquivo separado dos route.test.ts vizinhos pelo motivo de sempre nesta
 * base: a suíte roda com LOCAL_BYPASS_AUTH="true" (vem do .env via
 * vitest.config.ts) e nesse modo as guardas de src/lib/acesso.ts liberam tudo.
 * Aqui a flag é desligada e getServerSession é mockado, que é o caminho real
 * de produção.
 */

type SessaoFalsa = {
  user: { id?: string; email?: string | null; roles?: string[]; canViewBoard?: boolean };
} | null;

const session = vi.hoisted(() => ({ current: null as SessaoFalsa }));

// Para quem o e-mail de confirmação foi. É o efeito mais visível de abrir
// solicitação no nome de outra pessoa, então o teste olha o destinatário, não
// só a coluna requesterId.
const emails = vi.hoisted(() => ({ destinatarios: [] as string[] }));

vi.mock("next-auth", () => ({
  getServerSession: async () => session.current,
}));

// Templates REAIS, transporte simulado: o objeto parcial que existia aqui
// deixava os demais templates undefined e quebrava a cada template novo.
vi.mock("@/lib/integrations/gmail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/integrations/gmail")>()),
  sendPurchaseEmail: async (params: { to: string }) => {
    emails.destinatarios.push(params.to);
  },
}));

vi.mock("@/lib/integrations/slack", () => ({
  sendSlackDM: async () => {},
}));

// Sem gravar arquivo de verdade: o que está sob teste é quem pode anexar, não
// o armazenamento, e assim a suíte não deixa pasta em uploads/.
vi.mock("@/lib/storage", () => ({
  saveFile: async () => "local://teste/anexo-de-teste.pdf",
}));

const { POST: criarSolicitacao } = await import("./requests/route");
const { POST: anexarNoChamado } = await import("./tickets/[id]/attachments/route");

/**
 * Monta a sessão do jeito que o callback session() de src/lib/auth.ts monta em
 * produção: id, papéis e a coluna canViewBoard lidos do banco a cada chamada.
 * Escrever o objeto na mão deixaria passar um estado que a produção nunca
 * produz.
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

// ----------------------------------------------------------------------------
// POST /api/requests
// ----------------------------------------------------------------------------

function corpoDaSolicitacao(requesterId: string | undefined, descricao: string) {
  return {
    requesterId,
    diretoria: "TECNOLOGIA",
    leadershipPreApproved: true,
    budgetLineText: "Linha de teste",
    priority: "MEDIA",
    demandType: "COMPRA_SERVICO",
    shortDescription: descricao,
    longDescription: "Solicitação criada por teste de autorização de identidade.",
    suggestedDeadline: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    quantity: 1,
  };
}

async function postSolicitacao(corpo: Record<string, unknown>) {
  return criarSolicitacao(
    new NextRequest("http://localhost/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    })
  );
}

// ----------------------------------------------------------------------------
// POST /api/tickets/[id]/attachments
// ----------------------------------------------------------------------------

let contadorDeChamados = 0;

async function chamadoDe(requesterEmail: string) {
  contadorDeChamados += 1;
  return prisma.simpleTicket.create({
    data: {
      code: `TST-${TEST_PREFIX}ide${contadorDeChamados}`,
      category: "NDA",
      requesterName: `Solicitante ${contadorDeChamados}`,
      requesterEmail,
      description: "Chamado criado por teste de autorização de identidade.",
    },
  });
}

async function postAnexoNoChamado(ticketId: string, uploadedBy: string) {
  const form = new FormData();
  // "%PDF-" no início: bytes reais de assinatura de PDF, exigidos desde a
  // validação de conteúdo de anexo (src/lib/magic-bytes.ts). Texto puro sem
  // essa assinatura passa a ser recusado com 400, e este teste não é sobre
  // isso — é sobre identidade de quem anexa.
  form.append("file", new File(["%PDF-1.4\nconteudo de teste"], "minuta-confidencial.pdf", { type: "application/pdf" }));
  form.append("uploadedBy", uploadedBy);

  return anexarNoChamado(
    new NextRequest(`http://localhost/api/tickets/${ticketId}/attachments`, { method: "POST", body: form }),
    { params: { id: ticketId } }
  );
}

describe("Identidade em rotas de escrita", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    session.current = null;
    emails.destinatarios = [];
  });

  afterAll(async () => {
    vi.unstubAllEnvs();

    // As solicitações criadas aqui nascem pela própria rota, com código
    // sequencial de verdade (PC-AAAA-NNNN), então cleanupTestData(), que filtra
    // por TEST_PREFIX no code, não as alcança. O recorte seguro é pelos
    // usuários deste módulo, cujo e-mail carrega o prefixo.
    const usuarios = await prisma.user.findMany({
      where: { email: { contains: TEST_PREFIX } },
      select: { id: true },
    });
    const idsDeUsuario = usuarios.map((u) => u.id);
    if (idsDeUsuario.length > 0) {
      const solicitacoes = await prisma.purchaseRequest.findMany({
        where: { requesterId: { in: idsDeUsuario } },
        select: { id: true },
      });
      const idsDeSolicitacao = solicitacoes.map((s) => s.id);
      if (idsDeSolicitacao.length > 0) {
        await prisma.stageEvent.deleteMany({ where: { requestId: { in: idsDeSolicitacao } } });
        await prisma.attachment.deleteMany({ where: { requestId: { in: idsDeSolicitacao } } });
        await prisma.notification.deleteMany({ where: { requestId: { in: idsDeSolicitacao } } });
        await prisma.purchaseRequest.deleteMany({ where: { id: { in: idsDeSolicitacao } } });
      }
    }

    const chamados = await prisma.simpleTicket.findMany({
      where: { code: { contains: TEST_PREFIX } },
      select: { id: true },
    });
    const idsDeChamado = chamados.map((c) => c.id);
    if (idsDeChamado.length > 0) {
      await prisma.attachment.deleteMany({ where: { ticketId: { in: idsDeChamado } } });
      await prisma.ticketMessage.deleteMany({ where: { ticketId: { in: idsDeChamado } } });
      await prisma.simpleTicket.deleteMany({ where: { id: { in: idsDeChamado } } });
    }

    await cleanupTestData();
  });

  describe("POST /api/requests", () => {
    it("abre a solicitação no nome de quem está logado, ignorando o requesterId do corpo", async () => {
      const autor = await createTestUser(["SOLICITANTE"]);
      const vitima = await createTestUser(["SOLICITANTE"]);
      const costCenter = await createTestCostCenter();
      session.current = await sessaoDe(autor.id);

      const res = await postSolicitacao({
        ...corpoDaSolicitacao(vitima.id, "Compra aberta em nome de outra pessoa"),
        costCenterId: costCenter.id,
      });

      expect(res.status).toBe(201);
      const criada = (await res.json()) as { id: string; requesterId: string };
      expect(criada.requesterId).toBe(autor.id);
      expect(criada.requesterId).not.toBe(vitima.id);

      // O e-mail de confirmação é o dano visível: ele contava para a vítima
      // que ela tinha pedido uma compra que nunca pediu.
      expect(emails.destinatarios).toEqual([autor.email]);
      expect(emails.destinatarios).not.toContain(vitima.email);

      // E o histórico da solicitação também precisa apontar para quem abriu.
      const abertura = await prisma.stageEvent.findFirst({
        where: { requestId: criada.id, toStage: "SOLICITACAO" },
      });
      expect(abertura?.actorId).toBe(autor.id);
    });

    it("aceita o corpo quando não há sessão nenhuma, que é como o formulário local roda", async () => {
      // LOCAL_BYPASS_AUTH ligada e sem sessão: o ambiente de desenvolvimento
      // sem SSO, onde o solicitante vem do UserPicker do formulário. Se a rota
      // passasse a exigir sessão, nenhuma solicitação seria aberta localmente.
      vi.stubEnv("LOCAL_BYPASS_AUTH", "true");
      const solicitante = await createTestUser(["SOLICITANTE"]);
      const costCenter = await createTestCostCenter();
      session.current = null;

      const res = await postSolicitacao({
        ...corpoDaSolicitacao(solicitante.id, "Compra aberta pelo formulário local"),
        costCenterId: costCenter.id,
      });

      expect(res.status).toBe(201);
      const criada = (await res.json()) as { requesterId: string };
      expect(criada.requesterId).toBe(solicitante.id);
      expect(emails.destinatarios).toEqual([solicitante.email]);
    });

    it("dispensa o requesterId do corpo quando há sessão, em vez de recusar por campo faltando", async () => {
      const autor = await createTestUser(["SOLICITANTE"]);
      const costCenter = await createTestCostCenter();
      session.current = await sessaoDe(autor.id);

      const res = await postSolicitacao({
        ...corpoDaSolicitacao(undefined, "Compra sem requesterId no corpo"),
        costCenterId: costCenter.id,
      });

      expect(res.status).toBe(201);
      const criada = (await res.json()) as { requesterId: string };
      expect(criada.requesterId).toBe(autor.id);
    });
  });

  describe("POST /api/tickets/[id]/attachments", () => {
    it("recusa com 403 quem não abriu o chamado e não vê o quadro, sem gravar o anexo", async () => {
      const dono = await createTestUser(["SOLICITANTE"]);
      const estranho = await createTestUser(["SOLICITANTE"]);
      const chamado = await chamadoDe(dono.email);
      session.current = await sessaoDe(estranho.id);

      const res = await postAnexoNoChamado(chamado.id, estranho.name);

      expect(res.status).toBe(403);
      expect(await prisma.attachment.count({ where: { ticketId: chamado.id } })).toBe(0);
    });

    it("recusa com 401 quando não há sessão nenhuma", async () => {
      const dono = await createTestUser(["SOLICITANTE"]);
      const chamado = await chamadoDe(dono.email);
      session.current = null;

      const res = await postAnexoNoChamado(chamado.id, dono.name);

      expect(res.status).toBe(401);
      expect(await prisma.attachment.count({ where: { ticketId: chamado.id } })).toBe(0);
    });

    it("deixa o próprio solicitante anexar no chamado dele", async () => {
      const dono = await createTestUser(["SOLICITANTE"]);
      const chamado = await chamadoDe(dono.email);
      session.current = await sessaoDe(dono.id);

      const res = await postAnexoNoChamado(chamado.id, dono.name);

      expect(res.status).toBe(201);
      expect(await prisma.attachment.count({ where: { ticketId: chamado.id } })).toBe(1);
    });

    it("deixa anexar quem vê o quadro, que é quem atende o chamado", async () => {
      const dono = await createTestUser(["SOLICITANTE"]);
      const atendente = await createTestUser(["ADMIN"]);
      await prisma.user.update({ where: { id: atendente.id }, data: { canViewBoard: true } });
      const chamado = await chamadoDe(dono.email);
      session.current = await sessaoDe(atendente.id);

      const res = await postAnexoNoChamado(chamado.id, atendente.name);

      expect(res.status).toBe(201);
      expect(await prisma.attachment.count({ where: { ticketId: chamado.id } })).toBe(1);
    });
  });
});
