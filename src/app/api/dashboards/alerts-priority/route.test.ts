import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Item 2.9 do diagnóstico de IA: POST /api/dashboards/alerts-priority reordena
 * por urgência a MESMA lista de alertas do Dashboard, sem criar nem persistir
 * nada. Mesmo padrão de autorização de src/app/api/dashboards/export/route.auth.test.ts
 * (exigirQuadro), e generateInsight mockado para não bater na Anthropic/Gemini de verdade.
 */

const session = vi.hoisted(() => ({
  current: null as { user: { id?: string; email?: string; roles?: string[]; canViewBoard?: boolean } } | null,
}));
vi.mock("next-auth", () => ({ getServerSession: async () => session.current }));

const generateInsight = vi.hoisted(() => vi.fn());
vi.mock("@/lib/integrations/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/integrations/ai")>()),
  generateInsight,
}));

const { POST } = await import("./route");

function entrarComo(opcoes: { veQuadro?: boolean; papeis?: string[] } = {}) {
  session.current = {
    user: { id: "user-teste", email: "teste@acerto.com.br", roles: opcoes.papeis ?? [], canViewBoard: opcoes.veQuadro ?? false },
  };
}

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/dashboards/alerts-priority", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

const ALERTA_EXEMPLO = { severity: "danger", kind: "contrato", text: "Contrato de Fornecedor X vence em 3 dia(s)" };

describe("POST /api/dashboards/alerts-priority", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    session.current = null;
    generateInsight.mockReset();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("recusa quem não tem acesso ao quadro", async () => {
    entrarComo({ papeis: ["SOLICITANTE"], veQuadro: false });

    const res = await post({ alerts: [ALERTA_EXEMPLO] });

    expect(res.status).toBe(403);
    expect(generateInsight).not.toHaveBeenCalled();
  });

  it("recusa sem sessão nenhuma", async () => {
    const res = await post({ alerts: [ALERTA_EXEMPLO] });

    expect(res.status).toBe(401);
    expect(generateInsight).not.toHaveBeenCalled();
  });

  it("recusa lista de alertas vazia", async () => {
    entrarComo({ papeis: ["CONTROLADORIA"], veQuadro: true });

    const res = await post({ alerts: [] });

    expect(res.status).toBe(422);
    expect(generateInsight).not.toHaveBeenCalled();
  });

  it("prioriza os alertas recebidos e devolve os dois provedores", async () => {
    entrarComo({ papeis: ["CONTROLADORIA"], veQuadro: true });
    generateInsight.mockResolvedValueOnce({
      anthropic: { payload: { summary: "ok", highlights: ["Prioridade 1: ..."], cautions: [], recommendation: null, nextStep: null, draftMessage: null }, model: "x", error: null },
      gemini: { payload: null, model: null, error: "sem chave" },
    });

    const res = await post({ alerts: [ALERTA_EXEMPLO] });
    const corpo = await res.json();

    expect(res.status).toBe(200);
    expect(corpo.anthropic.payload.highlights).toEqual(["Prioridade 1: ..."]);
    expect(corpo.gemini.payload).toBeNull();
    expect(generateInsight).toHaveBeenCalledTimes(1);
  });
});
