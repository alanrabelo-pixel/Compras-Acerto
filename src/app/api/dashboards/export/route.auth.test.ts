import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createTestUser, createTestCostCenter, createTestRequest, cleanupTestData } from "@/test-helpers/fixtures";

/**
 * Regressão da leitura aberta em GET /api/dashboards/export.
 *
 * Era o pior caso do inventário de leitura: um GET sem nenhuma autorização
 * além da sessão @acerto.com.br devolvia a base inteira em cinco abas de
 * Excel, incluindo valores negociados, saving por pedido, exceções
 * orçamentárias e quem aprovou o quê. Um link só, colável no navegador.
 *
 * Arquivo separado porque a suíte roda com LOCAL_BYPASS_AUTH="true" (.env via
 * vitest.config.ts), e com a flag ligada exigirQuadro libera tudo.
 */

const session = vi.hoisted(() => ({
  current: null as { user: { id?: string; email?: string; roles?: string[]; canViewBoard?: boolean } } | null,
}));

vi.mock("next-auth", () => ({
  getServerSession: async () => session.current,
}));

const { GET } = await import("./route");

/** Mesmo formato de src/lib/acesso.test.ts: identidade vinda da sessão. */
function entrarComo(u: { id: string; email: string }, opcoes: { veQuadro?: boolean; papeis?: string[] } = {}) {
  session.current = {
    user: { id: u.id, email: u.email, roles: opcoes.papeis ?? [], canViewBoard: opcoes.veQuadro ?? false },
  };
}

function exportRequest(query = "") {
  return new NextRequest(`http://localhost/api/dashboards/export${query}`);
}

async function scenario() {
  const requester = await createTestUser(["SOLICITANTE"]);
  const approverManager = await createTestUser(["APROVADOR"]);
  const controladoria = await createTestUser(["CONTROLADORIA"]);
  const intruder = await createTestUser(["SOLICITANTE"]);
  await prisma.user.update({ where: { id: controladoria.id }, data: { canViewBoard: true } });
  const costCenter = await createTestCostCenter();
  const request = await createTestRequest({
    requesterId: requester.id,
    approverManagerId: approverManager.id,
    costCenterId: costCenter.id,
    currentStage: "MEDICAO",
    estimatedValue: 730000,
  });
  return { request, requester, costCenter, controladoria, intruder };
}

describe("GET /api/dashboards/export: autorização", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    session.current = null;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await cleanupTestData();
  });

  it("recusa quem não tem acesso ao quadro, sem gerar planilha nenhuma", async () => {
    const { intruder } = await scenario();
    entrarComo(intruder, { papeis: ["SOLICITANTE"] });

    const res = await GET(exportRequest());

    expect(res.status).toBe(403);
    // Não pode ter saído um .xlsx: nem o Content-Type de planilha, nem o
    // cabeçalho de download.
    expect(res.headers.get("Content-Type")).not.toContain("spreadsheetml");
    expect(res.headers.get("Content-Disposition")).toBeNull();
  });

  it("recusa quem só é parte de uma solicitação, porque a exportação é da base toda", async () => {
    const { requester } = await scenario();
    entrarComo(requester, { papeis: ["SOLICITANTE"] });

    const res = await GET(exportRequest());

    expect(res.status).toBe(403);
    expect(res.headers.get("Content-Type")).not.toContain("spreadsheetml");
  });

  it("recusa quando não há sessão nenhuma", async () => {
    await scenario();
    session.current = null;

    const res = await GET(exportRequest());

    expect(res.status).toBe(401);
    expect(res.headers.get("Content-Type")).not.toContain("spreadsheetml");
  });

  it("recusa a sessão sem id, que é como uma pessoa desativada continua chegando", async () => {
    const { controladoria } = await scenario();
    session.current = { user: { email: controladoria.email, roles: ["CONTROLADORIA"], canViewBoard: true } };

    const res = await GET(exportRequest());

    expect(res.status).toBe(401);
    expect(res.headers.get("Content-Type")).not.toContain("spreadsheetml");
  });

  it("permite quem tem acesso ao quadro e ainda devolve a planilha", async () => {
    const { costCenter, controladoria } = await scenario();
    entrarComo(controladoria, { papeis: ["CONTROLADORIA"], veQuadro: true });

    // Recorta pelo centro de custo de teste: o mesmo caminho de código, mas
    // sem varrer a base de desenvolvimento inteira dentro do teste.
    const res = await GET(exportRequest(`?costCenterId=${costCenter.id}`));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("spreadsheetml");
    const buffer = Buffer.from(await res.arrayBuffer());
    // "PK": assinatura de arquivo zip, que é o container do xlsx.
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
  });
});
