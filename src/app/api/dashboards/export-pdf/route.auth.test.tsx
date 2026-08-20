import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createTestUser, createTestCostCenter, createTestRequest, cleanupTestData } from "@/test-helpers/fixtures";

/**
 * Regressão da leitura aberta em GET /api/dashboards/export-pdf.
 *
 * Mesmo buraco do export em Excel, com um agravante de conteúdo: este é o
 * resumo EXECUTIVO. Gasto total da empresa, ranking de fornecedores por valor,
 * ranking de compradores com SLA individual e contratos a vencer, num PDF
 * pronto para circular, entregue a qualquer conta @acerto.com.br autenticada.
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

function pdfRequest(query = "") {
  return new NextRequest(`http://localhost/api/dashboards/export-pdf${query}`);
}

async function scenario() {
  const requester = await createTestUser(["SOLICITANTE"]);
  const approverManager = await createTestUser(["APROVADOR"]);
  const admin = await createTestUser(["ADMIN"]);
  const intruder = await createTestUser(["SOLICITANTE"]);
  await prisma.user.update({ where: { id: admin.id }, data: { canViewBoard: true } });
  const costCenter = await createTestCostCenter();
  const request = await createTestRequest({
    requesterId: requester.id,
    approverManagerId: approverManager.id,
    costCenterId: costCenter.id,
    currentStage: "APROVACAO",
    estimatedValue: 1250000,
  });
  return { request, requester, costCenter, admin, intruder };
}

describe("GET /api/dashboards/export-pdf: autorização", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    session.current = null;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await cleanupTestData();
  });

  it("recusa quem não tem acesso ao quadro, sem gerar PDF nenhum", async () => {
    const { intruder } = await scenario();
    entrarComo(intruder, { papeis: ["SOLICITANTE"] });

    const res = await GET(pdfRequest());

    expect(res.status).toBe(403);
    expect(res.headers.get("Content-Type")).not.toContain("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBeNull();
  });

  it("recusa quem só é parte de uma solicitação, porque o resumo é da empresa inteira", async () => {
    const { requester } = await scenario();
    entrarComo(requester, { papeis: ["SOLICITANTE"] });

    const res = await GET(pdfRequest());

    expect(res.status).toBe(403);
    expect(res.headers.get("Content-Type")).not.toContain("application/pdf");
  });

  it("recusa quando não há sessão nenhuma", async () => {
    await scenario();
    session.current = null;

    const res = await GET(pdfRequest());

    expect(res.status).toBe(401);
    expect(res.headers.get("Content-Type")).not.toContain("application/pdf");
  });

  it("permite quem tem acesso ao quadro e ainda devolve o PDF", async () => {
    const { costCenter, admin } = await scenario();
    entrarComo(admin, { papeis: ["ADMIN"], veQuadro: true });

    // Recorta pelo centro de custo de teste para não agregar a base de
    // desenvolvimento inteira só para conferir a guarda.
    const res = await GET(pdfRequest(`?costCenterId=${costCenter.id}`));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    const buffer = Buffer.from(await res.arrayBuffer());
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
  });
});
