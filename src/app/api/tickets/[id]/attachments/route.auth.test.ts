import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createTestUser, cleanupTestData, TEST_PREFIX } from "@/test-helpers/fixtures";

/**
 * Regressão de leitura em GET /api/tickets/[id]/attachments.
 *
 * Antes da guarda, qualquer conta autenticada listava os anexos de qualquer
 * chamado pelo id do chamado. O nome do arquivo sozinho já entrega conteúdo
 * ("NDA Fornecedor X.pdf"), então a listagem precisa do mesmo recorte que o
 * detalhe do chamado.
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

async function criarChamadoComAnexo(requesterEmail: string) {
  contadorDeChamados += 1;
  const chamado = await prisma.simpleTicket.create({
    data: {
      code: `TST-${TEST_PREFIX}anx${contadorDeChamados}`,
      category: "NDA",
      requesterName: `Solicitante ${contadorDeChamados}`,
      requesterEmail,
      description: "Chamado criado por teste de autorização.",
    },
  });
  const anexo = await prisma.attachment.create({
    data: {
      ticketId: chamado.id,
      fileName: "NDA Fornecedor Confidencial.pdf",
      storageUrl: `local://${TEST_PREFIX}${chamado.id}.pdf`,
      uploadedBy: requesterEmail,
    },
  });
  return { chamado, anexo };
}

/** cleanupTestData não conhece SimpleTicket/Attachment, então este arquivo limpa o que criou. */
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

function attachmentsRequest(id: string) {
  return new NextRequest(`http://localhost/api/tickets/${id}/attachments`);
}

async function cenario() {
  const dono = await createTestUser(["SOLICITANTE"]);
  const estranho = await createTestUser(["SOLICITANTE"]);
  const comQuadro = await createTestUser(["ADMIN"]);
  // A coluna canViewBoard é o que um ADMIN marca em /admin/acessos, e é dela
  // que atorDaSessao tira veQuadro. Deixar coluna e papel coerentes no fixture
  // evita testar um estado que a tela de Acessos não produz.
  await prisma.user.update({ where: { id: comQuadro.id }, data: { canViewBoard: true } });
  const { chamado, anexo } = await criarChamadoComAnexo(dono.email);
  return { dono, estranho, comQuadro, chamado, anexo };
}

describe("GET /api/tickets/[id]/attachments: autorização", () => {
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

    const res = await GET(attachmentsRequest(chamado.id), { params: { id: chamado.id } });

    expect(res.status).toBe(403);
    // O nome do arquivo é o próprio vazamento, então não pode vir na negativa.
    expect(JSON.stringify(await res.json())).not.toContain("NDA Fornecedor Confidencial.pdf");
  });

  it("permite que o próprio solicitante liste os anexos do chamado dele", async () => {
    const { dono, chamado, anexo } = await cenario();
    session.current = sessaoDe(dono, ["SOLICITANTE"], false);

    const res = await GET(attachmentsRequest(chamado.id), { params: { id: chamado.id } });

    expect(res.status).toBe(200);
    const ids = ((await res.json()) as { id: string }[]).map((a) => a.id);
    expect(ids).toEqual([anexo.id]);
  });

  it("permite quem tem quadro, que é quem atende o chamado", async () => {
    const { comQuadro, chamado, anexo } = await cenario();
    session.current = sessaoDe(comQuadro, ["ADMIN"], true);

    const res = await GET(attachmentsRequest(chamado.id), { params: { id: chamado.id } });

    expect(res.status).toBe(200);
    const ids = ((await res.json()) as { id: string }[]).map((a) => a.id);
    expect(ids).toEqual([anexo.id]);
  });

  it("recusa quando não há sessão nenhuma", async () => {
    const { chamado } = await cenario();
    session.current = null;

    const res = await GET(attachmentsRequest(chamado.id), { params: { id: chamado.id } });

    expect(res.status).toBe(401);
  });
});
