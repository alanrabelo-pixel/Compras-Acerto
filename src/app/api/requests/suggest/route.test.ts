import { describe, it, expect, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createTestUser, createTestCostCenter, createTestRequest, cleanupTestData } from "@/test-helpers/fixtures";

/**
 * Item 2.3 do diagnóstico de IA: POST /api/requests/suggest agora também
 * busca solicitações ABERTAS do mesmo centro de custo e as repassa para
 * generateRequisitionAssist checar duplicidade. Aqui só testamos a busca em
 * si (o que entra/não entra na lista de candidatas) — a análise de
 * duplicidade em si é responsabilidade do modelo, mockado abaixo.
 */
const generateRequisitionAssist = vi.hoisted(() => vi.fn());
vi.mock("@/lib/integrations/ai", () => ({ generateRequisitionAssist }));

const { POST } = await import("./route");

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/requests/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

describe("POST /api/requests/suggest", () => {
  afterAll(async () => {
    await cleanupTestData();
  });

  it("sem costCenterId, não busca candidatas", async () => {
    generateRequisitionAssist.mockResolvedValueOnce({ payload: { note: "ok" }, model: "x", error: null });

    await post({ description: "Preciso contratar uma ferramenta de assinatura eletrônica" });

    expect(generateRequisitionAssist).toHaveBeenCalledWith(expect.any(String), []);
  });

  it("com costCenterId, inclui só solicitações abertas do mesmo centro", async () => {
    const requester = await createTestUser(["SOLICITANTE"]);
    const aprovador = await createTestUser(["APROVADOR"]);
    const centro = await createTestCostCenter();
    const outroCentro = await createTestCostCenter();

    const aberta = await createTestRequest({
      requesterId: requester.id,
      approverManagerId: aprovador.id,
      costCenterId: centro.id,
      currentStage: "TRIAGEM",
    });
    await createTestRequest({
      requesterId: requester.id,
      approverManagerId: aprovador.id,
      costCenterId: centro.id,
      currentStage: "CONCLUIDO",
    });
    await createTestRequest({
      requesterId: requester.id,
      approverManagerId: aprovador.id,
      costCenterId: centro.id,
      currentStage: "CANCELADO",
    });
    await createTestRequest({
      requesterId: requester.id,
      approverManagerId: aprovador.id,
      costCenterId: outroCentro.id,
      currentStage: "TRIAGEM",
    });

    generateRequisitionAssist.mockResolvedValueOnce({ payload: { note: "ok" }, model: "x", error: null });

    await post({ description: "Preciso contratar uma ferramenta de assinatura eletrônica", costCenterId: centro.id });

    const [, candidatas] = generateRequisitionAssist.mock.calls.at(-1)!;
    expect(candidatas).toHaveLength(1);
    expect(candidatas[0]).toEqual({
      code: aberta.code,
      shortDescription: aberta.shortDescription,
      longDescription: aberta.longDescription,
    });
  });
});
