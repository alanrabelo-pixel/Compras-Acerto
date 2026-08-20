import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createTestUser, cleanupTestData, TEST_PREFIX } from "@/test-helpers/fixtures";

/**
 * Regressão de leitura em GET /api/tickets/[id].
 *
 * Antes da guarda o detalhe não checava nada: qualquer conta autenticada lia
 * qualquer chamado pelo id, com o histórico de mensagens inteiro junto. A tela
 * de detalhe já aplica o recorte (ver src/lib/chamados-viewer.ts), mas a rota
 * é chamável direto.
 *
 * Arquivo separado dos demais testes da rota porque a suíte roda com
 * LOCAL_BYPASS_AUTH="true" (vem do .env via vitest.config.ts) e nesse modo
 * exigirLeituraDeChamado libera tudo. Aqui a flag é desligada e
 * getServerSession é mockado, que é o caminho real de produção.
 */

/**
 * Mesma forma que o callback session() de src/lib/auth.ts monta: id, email,
 * roles e a coluna canViewBoard. atorDaSessao (src/lib/acesso.ts) exige o id e
 * tira veQuadro de canViewBoard.
 */
type SessaoFake = {
  user: { id: string; email: string; roles: string[]; canViewBoard: boolean };
} | null;
const session = vi.hoisted(() => ({ current: null as SessaoFake }));

vi.mock("next-auth", () => ({
  getServerSession: async () => session.current,
}));

const { GET } = await import("./route");

function sessaoDe(user: { id: string; email: string }, roles: string[], quadro: boolean): SessaoFake {
  return { user: { id: user.id, email: user.email, roles, canViewBoard: quadro } };
}

let contadorDeChamados = 0;

async function criarChamado(requesterEmail: string) {
  contadorDeChamados += 1;
  return prisma.simpleTicket.create({
    data: {
      code: `TST-${TEST_PREFIX}nda${contadorDeChamados}`,
      category: "NDA",
      requesterName: `Solicitante ${contadorDeChamados}`,
      requesterEmail,
      description: "Chamado criado por teste de autorização.",
      supplierName: "Fornecedor Confidencial",
    },
  });
}

/** cleanupTestData não conhece SimpleTicket, então este arquivo limpa o que criou. */
async function limparChamadosDeTeste() {
  const chamados = await prisma.simpleTicket.findMany({
    where: { code: { contains: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = chamados.map((c) => c.id);
  if (ids.length > 0) {
    await prisma.attachment.deleteMany({ where: { ticketId: { in: ids } } });
    await prisma.ticketMessage.deleteMany({ where: { ticketId: { in: ids } } });
    await prisma.simpleTicket.deleteMany({ where: { id: { in: ids } } });
  }
}

function detailRequest(id: string) {
  return new NextRequest(`http://localhost/api/tickets/${id}`);
}

async function cenario() {
  const dono = await createTestUser(["SOLICITANTE"]);
  const estranho = await createTestUser(["SOLICITANTE"]);
  const comQuadro = await createTestUser(["CONTROLADORIA"]);
  // A coluna canViewBoard é o que um ADMIN marca em /admin/acessos, e é dela
  // que atorDaSessao tira veQuadro. Deixar coluna e papel coerentes no fixture
  // evita testar um estado que a tela de Acessos não produz.
  await prisma.user.update({ where: { id: comQuadro.id }, data: { canViewBoard: true } });
  const chamado = await criarChamado(dono.email);
  await prisma.ticketMessage.create({
    data: { ticketId: chamado.id, authorName: "Atendente", body: "Mensagem interna do chamado." },
  });
  return { dono, estranho, comQuadro, chamado };
}

describe("GET /api/tickets/[id]: autorização", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    session.current = null;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await limparChamadosDeTeste();
    await cleanupTestData();
  });

  it("recusa quem não abriu o chamado e não tem quadro", async () => {
    const { estranho, chamado } = await cenario();
    session.current = sessaoDe(estranho, ["SOLICITANTE"], false);

    const res = await GET(detailRequest(chamado.id), { params: { id: chamado.id } });

    expect(res.status).toBe(403);
    // Nem o corpo do chamado nem as mensagens podem vazar na resposta negada.
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain("Fornecedor Confidencial");
    expect(body).not.toContain("Mensagem interna do chamado.");
  });

  it("permite que o próprio solicitante leia o chamado dele", async () => {
    const { dono, chamado } = await cenario();
    session.current = sessaoDe(dono, ["SOLICITANTE"], false);

    const res = await GET(detailRequest(chamado.id), { params: { id: chamado.id } });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; messages: unknown[] };
    expect(body.id).toBe(chamado.id);
    expect(body.messages).toHaveLength(1);
  });

  it("permite quem tem quadro, que é quem atende o chamado", async () => {
    const { comQuadro, chamado } = await cenario();
    session.current = sessaoDe(comQuadro, ["CONTROLADORIA"], true);

    const res = await GET(detailRequest(chamado.id), { params: { id: chamado.id } });

    expect(res.status).toBe(200);
    expect(((await res.json()) as { id: string }).id).toBe(chamado.id);
  });

  it("recusa quando não há sessão nenhuma", async () => {
    const { chamado } = await cenario();
    session.current = null;

    const res = await GET(detailRequest(chamado.id), { params: { id: chamado.id } });

    expect(res.status).toBe(401);
  });
});
