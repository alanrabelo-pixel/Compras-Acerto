import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createTestUser, cleanupTestData, TEST_PREFIX } from "@/test-helpers/fixtures";

/**
 * Regressão de leitura em GET /api/tickets.
 *
 * Antes da guarda, a listagem devolvia TODOS os chamados da categoria para
 * qualquer conta autenticada, sem nenhum recorte: a tela em
 * src/app/chamados/[category]/page.tsx já mostra só os próprios para quem não
 * tem canViewBoard, mas a API é chamável direto e não repetia a regra. Em NDA
 * isso expunha nome e contato de fornecedor de todo mundo.
 *
 * Por que este arquivo é separado dos demais testes da rota: a suíte roda com
 * LOCAL_BYPASS_AUTH="true" (vem do .env via vitest.config.ts), e com a flag
 * ligada resolveChamadoViewer devolve showFullBoard para qualquer um. Um teste
 * de autorização escrito lá passaria sem exercer nada. Aqui a flag é desligada
 * e getServerSession é mockado, que é o caminho real de produção.
 */

/**
 * Mesma forma que o callback session() de src/lib/auth.ts monta: id, email,
 * roles e a coluna canViewBoard. resolveChamadoViewer lê roles; atorDaSessao
 * (src/lib/acesso.ts) lê id e canViewBoard.
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

/** Chamado de Viagens marcado com o prefixo do arquivo, para o cleanup achar. */
async function criarChamado(requesterEmail: string) {
  contadorDeChamados += 1;
  return prisma.simpleTicket.create({
    data: {
      code: `TST-${TEST_PREFIX}vg${contadorDeChamados}`,
      category: "VIAGENS",
      requesterName: `Solicitante ${contadorDeChamados}`,
      requesterEmail,
      description: "Chamado criado por teste de autorização.",
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

function listRequest(categoria: string) {
  return new NextRequest(`http://localhost/api/tickets?category=${categoria}`);
}

/** Um chamado do solicitante e um de outra pessoa, na mesma categoria. */
async function cenario() {
  const dono = await createTestUser(["SOLICITANTE"]);
  const estranho = await createTestUser(["SOLICITANTE"]);
  const comQuadro = await createTestUser(["COMPRADOR"]);
  // A coluna canViewBoard é o que um ADMIN marca em /admin/acessos; o papel
  // sozinho não a liga. Deixar as duas coerentes no fixture evita testar um
  // estado que a tela de Acessos não produz.
  await prisma.user.update({ where: { id: comQuadro.id }, data: { canViewBoard: true } });
  const meu = await criarChamado(dono.email);
  const alheio = await criarChamado(estranho.email);
  return { dono, estranho, comQuadro, meu, alheio };
}

describe("GET /api/tickets: autorização", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    session.current = null;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await limparChamadosDeTeste();
    await cleanupTestData();
  });

  it("solicitante sem quadro recebe só os próprios chamados", async () => {
    const { dono, meu, alheio } = await cenario();
    session.current = sessaoDe(dono, ["SOLICITANTE"], false);

    const res = await GET(listRequest("viagens"));
    expect(res.status).toBe(200);

    const ids = ((await res.json()) as { id: string }[]).map((t) => t.id);
    expect(ids).toContain(meu.id);
    // O ponto que mais importa: o chamado da outra pessoa não pode vir junto.
    expect(ids).not.toContain(alheio.id);
  });

  it("quem tem quadro continua vendo a categoria inteira", async () => {
    const { comQuadro, meu, alheio } = await cenario();
    session.current = sessaoDe(comQuadro, ["COMPRADOR"], true);

    const res = await GET(listRequest("viagens"));
    expect(res.status).toBe(200);

    const ids = ((await res.json()) as { id: string }[]).map((t) => t.id);
    expect(ids).toContain(meu.id);
    expect(ids).toContain(alheio.id);
  });

  it("recusa quando não há sessão nenhuma", async () => {
    await cenario();
    session.current = null;

    const res = await GET(listRequest("viagens"));
    expect(res.status).toBe(401);
  });
});
