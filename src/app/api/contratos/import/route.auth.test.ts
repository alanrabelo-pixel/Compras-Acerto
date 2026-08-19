import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { createTestUser, cleanupTestData, TEST_PREFIX } from "@/test-helpers/fixtures";

/**
 * Regressão da importação de contratos sem autorização.
 *
 * A rota criava contratos em massa sem checar sessão nem papel. Como o e-mail
 * do gestor vem da planilha, dava para injetar contratos falsos apontando para
 * um executivo real: eles entram no cron de renovação e disparam e-mail e Slack
 * em nome do sistema, o que é um vetor de fraude interna com credibilidade.
 *
 * Arquivo separado de outros testes porque aqui a flag de bypass precisa estar
 * desligada; com ela ligada (o padrão em desenvolvimento) a checagem é pulada e
 * nada seria exercido.
 */

const session = vi.hoisted(() => ({ current: null as { user: { roles?: string[] } } | null }));

vi.mock("next-auth", () => ({
  getServerSession: async () => session.current,
}));

const { POST } = await import("./route");

function planilha(linhas: Record<string, string>[]): Uint8Array<ArrayBuffer> {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), "Contratos");
  const bruto = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Uint8Array;
  // Copia para um ArrayBuffer de verdade. O Buffer do Node é respaldado por
  // ArrayBufferLike, que pode ser SharedArrayBuffer, e o construtor de File
  // exige BlobPart, que não aceita esse tipo mais amplo.
  const conteudo = new Uint8Array(new ArrayBuffer(bruto.byteLength));
  conteudo.set(bruto);
  return conteudo;
}

function uploadRequest(conteudo: Uint8Array<ArrayBuffer>) {
  const form = new FormData();
  form.set("file", new File([conteudo], "contratos.xlsx", { type: "application/vnd.ms-excel" }));
  return new NextRequest("http://localhost/api/contratos/import", { method: "POST", body: form });
}

/** Uma linha válida, para provar que a recusa vem da autorização e não do formato. */
function linhaValida(gestorEmail: string) {
  return {
    "Razão Social": `${TEST_PREFIX}Fornecedor Falso LTDA`,
    "Nome Fantasia": `${TEST_PREFIX}Falso`,
    CNPJ: "00000000000191",
    "Tipo de Documento": "CONTRATO",
    Status: "ATIVO",
    Diretoria: "CORPORATIVO",
    "E-mail do Gestor": gestorEmail,
    "Centro de Custo": `${TEST_PREFIX}CC`,
    "Área": "Tecnologia",
    "Início da Vigência": "01/01/2026",
    "Fim da Vigência": "31/12/2026",
  };
}

describe("POST /api/contratos/import: autorização", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    session.current = null;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    // cleanupTestData() não cobre Contract, e o teste de caminho feliz abaixo
    // cria um de verdade. Sem esta limpeza o teste deixaria lixo no banco de
    // desenvolvimento, que é compartilhado com o app.
    await prisma.contract.deleteMany({ where: { supplierName: { contains: TEST_PREFIX } } });
    await cleanupTestData();
  });

  it("recusa sem sessão e não cria contrato nenhum", async () => {
    const gestor = await createTestUser(["COMPRADOR"]);
    const antes = await prisma.contract.count();

    const res = await POST(uploadRequest(planilha([linhaValida(gestor.email)])));

    expect(res.status).toBe(403);
    expect(await prisma.contract.count()).toBe(antes);
  });

  it("recusa quem está autenticado mas não é ADMIN", async () => {
    const gestor = await createTestUser(["COMPRADOR"]);
    session.current = { user: { roles: ["COMPRADOR", "APROVADOR"] } };
    const antes = await prisma.contract.count();

    const res = await POST(uploadRequest(planilha([linhaValida(gestor.email)])));

    expect(res.status).toBe(403);
    expect(await prisma.contract.count()).toBe(antes);
  });

  it("permite ADMIN, confirmando que a recusa acima é de autorização e não de formato", async () => {
    const gestor = await createTestUser(["COMPRADOR"]);
    session.current = { user: { roles: ["ADMIN"] } };

    const res = await POST(uploadRequest(planilha([linhaValida(gestor.email)])));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBeGreaterThan(0);
  });

  it("recusa planilha acima do limite de linhas", async () => {
    const gestor = await createTestUser(["COMPRADOR"]);
    session.current = { user: { roles: ["ADMIN"] } };
    const muitas = Array.from({ length: 2001 }, () => linhaValida(gestor.email));

    const res = await POST(uploadRequest(planilha(muitas)));

    expect(res.status).toBe(413);
  });
});
