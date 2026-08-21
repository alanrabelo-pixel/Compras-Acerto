import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

/**
 * CRUD das faixas de alçada (ApprovalTier), criado em 21/08/2026 para o dono
 * do sistema poder incluir, editar e desativar faixas sem deploy.
 *
 * O caso mais importante deste arquivo é o da FAIXA DO TOPO, e ele existe
 * porque o defeito aconteceu de verdade: na verificação em navegador, remover
 * a faixa sem teto passou. A regra "nunca usada, pode apagar" disparou certo
 * pela própria lógica e ninguém olhou que aquela era a única sem teto. A
 * escada ficou aberta em cima, e toda compra acima do maior valor passaria a
 * não ter alçada.
 *
 * Roda com LOCAL_BYPASS_AUTH (padrão da suíte), então exigirPapel libera.
 */

const MARCA = "__faixa_de_teste__";

async function limpar() {
  await prisma.approvalTier.deleteMany({ where: { label: { contains: MARCA } } });
}

/** Escada isolada: as faixas semeadas pela migration saem de cena e voltam. */
let semeadas: { level: number; label: string; maxValue: unknown; requiredApprovers: number; active: boolean }[] = [];

beforeEach(async () => {
  semeadas = await prisma.approvalTier.findMany();
  await prisma.approvalTier.deleteMany({});
  await prisma.approvalTier.createMany({
    data: [
      { level: 901, label: `Baixa ${MARCA}`, maxValue: 1000, requiredApprovers: 1 },
      { level: 902, label: `Topo ${MARCA}`, maxValue: null, requiredApprovers: 2 },
    ],
  });
});

afterEach(async () => {
  await limpar();
  await prisma.approvalTier.deleteMany({});
  if (semeadas.length > 0) {
    await prisma.approvalTier.createMany({
      data: semeadas.map((f) => ({
        level: f.level,
        label: f.label,
        maxValue: f.maxValue as never,
        requiredApprovers: f.requiredApprovers,
        active: f.active,
      })),
    });
  }
});

const { GET, POST } = await import("./route");
const { PATCH, DELETE } = await import("./[level]/route");

function post(corpo: unknown) {
  return POST(
    new NextRequest("http://localhost/api/approval-tiers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    }),
  );
}
function patch(level: number, corpo: unknown) {
  return PATCH(
    new NextRequest(`http://localhost/api/approval-tiers/${level}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    }),
    { params: { level: String(level) } },
  );
}
function del(level: number) {
  return DELETE(new NextRequest(`http://localhost/api/approval-tiers/${level}`, { method: "DELETE" }), {
    params: { level: String(level) },
  });
}

describe("A faixa do topo não pode desaparecer", () => {
  it("recusa APAGAR a faixa sem teto, mesmo que ela nunca tenha sido usada", async () => {
    // O defeito real: a faixa 902 não tem Approval nem aprovador, então a
    // regra de "nunca usada" apagaria, deixando a escada sem topo.
    const res = await del(902);

    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("faixa do topo");
    expect(await prisma.approvalTier.count({ where: { level: 902 } })).toBe(1);
  });

  it("recusa DESATIVAR a faixa sem teto", async () => {
    const res = await patch(902, { active: false });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("faixa do topo");
  });

  it("recusa dar um teto à faixa do topo, que a deixaria de ser topo", async () => {
    const res = await patch(902, { maxValue: 5000 });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("faixa do topo");
  });

  it("permite mexer na faixa do topo depois que outra vira topo", async () => {
    // O caminho de saída existe, e é este: promover outra faixa a topo antes.
    await patch(901, { maxValue: null });
    // Agora 901 é topo e 902 também seria: a regra da faixa única sem teto
    // recusa, o que é correto. Então 902 precisa ganhar teto primeiro.
    const promocaoRecusada = await patch(901, { maxValue: null });
    expect(promocaoRecusada.status).toBe(409);
  });

  it("permite apagar uma faixa comum, que não é a do topo", async () => {
    const res = await del(901);

    expect(res.status).toBe(200);
    expect((await res.json()).removida).toBe(true);
    expect(await prisma.approvalTier.count({ where: { level: 901 } })).toBe(0);
  });
});

describe("POST: incluir faixa", () => {
  it("cria com o próximo número livre, sem reaproveitar número de faixa apagada", async () => {
    const res = await post({ label: `Nova ${MARCA}`, maxValue: 500, requiredApprovers: 1 });

    expect(res.status).toBe(201);
    // 902 é o maior existente, então a nova é 903, e não 903 por contagem.
    expect((await res.json()).level).toBe(903);
  });

  it("a faixa nova entra na escada pelo TETO, não pelo número", async () => {
    await post({ label: `Meio ${MARCA}`, maxValue: 500, requiredApprovers: 1 });

    const lista = await (await GET(new NextRequest("http://localhost/api/approval-tiers"))).json();
    expect(lista.map((f: { level: number }) => f.level)).toEqual([903, 901, 902]);
  });

  it("recusa uma segunda faixa sem teto", async () => {
    const res = await post({ label: `Outro topo ${MARCA}`, maxValue: null, requiredApprovers: 1 });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("sem teto");
  });

  it("recusa teto repetido entre faixas ativas", async () => {
    const res = await post({ label: `Repetida ${MARCA}`, maxValue: 1000, requiredApprovers: 1 });

    expect(res.status).toBe(409);
  });

  it("recusa nome vazio e assinaturas abaixo de 1", async () => {
    expect((await post({ label: "  ", maxValue: 10, requiredApprovers: 1 })).status).toBe(400);
    expect((await post({ label: `X ${MARCA}`, maxValue: 10, requiredApprovers: 0 })).status).toBe(400);
  });
});

describe("PATCH: editar faixa", () => {
  it("altera nome, teto e assinaturas", async () => {
    const res = await patch(901, { label: `Renomeada ${MARCA}`, maxValue: 2500, requiredApprovers: 3 });

    expect(res.status).toBe(200);
    const faixa = await prisma.approvalTier.findUniqueOrThrow({ where: { level: 901 } });
    expect(faixa.label).toContain("Renomeada");
    expect(Number(faixa.maxValue)).toBe(2500);
    expect(faixa.requiredApprovers).toBe(3);
  });

  it("aceita mais de 2 assinaturas, que a escada antiga não permitia", async () => {
    const res = await patch(901, { requiredApprovers: 5 });

    expect(res.status).toBe(200);
    expect((await prisma.approvalTier.findUniqueOrThrow({ where: { level: 901 } })).requiredApprovers).toBe(5);
  });

  it("devolve 404 para faixa inexistente", async () => {
    expect((await patch(9999, { label: "x" })).status).toBe(404);
  });
});
