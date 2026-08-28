import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { TEST_PREFIX } from "@/test-helpers/fixtures";

/**
 * Item 2.8 do diagnóstico de IA: resumo executivo mensal automático. Este
 * teste cobre o controle da rota (autenticação de máquina, destinatários
 * ausentes, guard de duplicidade) — não o conteúdo narrado pela IA, que aqui
 * roda sem ANTHROPIC_API_KEY/GEMINI_API_KEY configuradas (mesmo caminho de
 * "leitura por IA indisponível" que a rota já trata para esse mês).
 *
 * O mock de sendPurchaseEmail também grava em Notification (como o real faz),
 * porque é exatamente esse registro que a rota usa para não reenviar duas
 * vezes no mesmo mês — sem isso o teste de idempotência não exercitaria nada.
 */

const emailsEnviados = vi.hoisted(() => [] as string[]);

vi.mock("@/lib/integrations/gmail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/integrations/gmail")>()),
  sendPurchaseEmail: async (params: { to: string; subject: string }) => {
    emailsEnviados.push(params.to);
    await prisma.notification.create({
      data: { channel: "EMAIL", recipient: params.to, subject: params.subject, status: "ENVIADO" },
    });
  },
}));

vi.mock("@/lib/integrations/slack", () => ({
  sendSlackDM: async () => {},
}));

const { GET } = await import("./route");

const SEGREDO = "segredo-de-cron-para-teste";
const DESTINATARIO_TESTE = `${TEST_PREFIX}@teste.acerto.com.br`;

function rodarCron(authorization: string | null = `Bearer ${SEGREDO}`) {
  const headers = authorization ? { authorization } : undefined;
  return GET(new NextRequest("http://localhost/api/cron/monthly-summary", { headers }));
}

describe("GET /api/cron/monthly-summary", () => {
  beforeEach(async () => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    vi.stubEnv("CRON_SECRET", SEGREDO);
    vi.stubEnv("APP_ENV", "producao");
    emailsEnviados.length = 0;
    // O guard de duplicidade é por mês (assunto), não por teste: sem limpar
    // entre casos, o envio do teste anterior faria os seguintes verem "já
    // enviado" mesmo com um cenário diferente.
    await prisma.notification.deleteMany({ where: { recipient: { contains: TEST_PREFIX } } });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { recipient: { contains: TEST_PREFIX } } });
    vi.unstubAllEnvs();
  });

  it("recusa chamada sem credencial de máquina e não envia nada", async () => {
    const res = await rodarCron(null);

    expect(res.status).toBe(401);
    expect(emailsEnviados).toHaveLength(0);
  });

  it("sem DESTINATARIOS_RESUMO_EXECUTIVO configurada, não envia e avisa o motivo", async () => {
    vi.stubEnv("DESTINATARIOS_RESUMO_EXECUTIVO", "");

    const res = await rodarCron();
    const corpo = await res.json();

    expect(res.status).toBe(200);
    expect(corpo.enviado).toBe(false);
    expect(emailsEnviados).toHaveLength(0);
  });

  it("com destinatário configurado, envia o resumo", async () => {
    vi.stubEnv("DESTINATARIOS_RESUMO_EXECUTIVO", DESTINATARIO_TESTE);

    const res = await rodarCron();
    const corpo = await res.json();

    expect(res.status).toBe(200);
    expect(corpo.enviado).toBe(true);
    expect(emailsEnviados).toEqual([DESTINATARIO_TESTE]);
  });

  it("não reenvia no mesmo mês quando o agendador dispara duas vezes", async () => {
    vi.stubEnv("DESTINATARIOS_RESUMO_EXECUTIVO", DESTINATARIO_TESTE);

    await rodarCron();
    const segunda = await rodarCron();
    const corpo = await segunda.json();

    expect(corpo.enviado).toBe(false);
    expect(emailsEnviados).toEqual([DESTINATARIO_TESTE]);
  });
});
