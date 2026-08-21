import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createTestUser, cleanupTestData, TEST_PREFIX } from "@/test-helpers/fixtures";

/**
 * Cadência do alerta de renovação de contrato (achado 10).
 *
 * Antes da correção esta rota enviava em TODA chamada: não olhava o histórico
 * de ContractAlert para nada. Duas execuções no mesmo dia mandavam dois avisos
 * iguais para o mesmo gestor, e a periodicidade que o manual promete dependia
 * inteiramente de como o agendador externo estivesse configurado (configuração
 * que nem existe neste repositório). Agora quem decide é o último envio
 * registrado: no máximo um aviso por contrato por semana, e o contrato volta a
 * entrar assim que a semana passa, seja qual for o dia em que o cron rodar.
 *
 * Arquivo separado porque precisa substituir os módulos de e-mail e Slack por
 * dublês (senão o teste tenta falar com o Google e com o Slack de verdade) e
 * porque a autenticação daqui é o token de máquina CRON_SECRET, não a sessão.
 * LOCAL_BYPASS_AUTH é desligado mesmo assim: com a flag ligada (o padrão da
 * suíte, vindo do .env) nenhum teste que encoste em autorização exerce nada.
 */

const emailsEnviados = vi.hoisted(() => [] as string[]);
const slacksEnviados = vi.hoisted(() => [] as string[]);

// Templates REAIS, transporte simulado. Mockar só alguns templates quebrava a
// suíte a cada template novo, porque o objeto parcial deixava os outros
// undefined; o envio continua capturado, que é o que este arquivo mede.
vi.mock("@/lib/integrations/gmail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/integrations/gmail")>()),
  sendPurchaseEmail: async (params: { to: string }) => {
    emailsEnviados.push(params.to);
  },
}));

vi.mock("@/lib/integrations/slack", () => ({
  sendSlackDM: async (params: { slackUserEmail: string }) => {
    slacksEnviados.push(params.slackUserEmail);
  },
}));

const { GET } = await import("./route");

const SEGREDO = "segredo-de-cron-para-teste";
const DIA = 86_400_000;

function rodarCron(authorization: string | null = `Bearer ${SEGREDO}`) {
  const headers = authorization ? { authorization } : undefined;
  return GET(new NextRequest("http://localhost/api/cron/contract-alerts", { headers }));
}

/** Contrato ativo com renovação dentro da janela de 3 meses que o cron olha. */
async function criarContratoAVencer(dias = 30) {
  const gestor = await createTestUser([]);
  const agora = new Date();
  const contrato = await prisma.contract.create({
    data: {
      supplierName: `Fornecedor ${TEST_PREFIX}`,
      startDate: new Date(agora.getTime() - 365 * DIA),
      endDate: new Date(agora.getTime() + dias * DIA),
      renewalDate: new Date(agora.getTime() + dias * DIA),
      contractManagerId: gestor.id,
      area: "Tecnologia",
      costCenter: `Centro ${TEST_PREFIX}`,
    },
  });
  return { contrato, gestor };
}

/** Simula um envio já registrado, como se o cron tivesse rodado no passado. */
function registrarAlertaAntigo(contratoId: string, horasAtras: number) {
  return prisma.contractAlert.create({
    data: {
      contractId: contratoId,
      channel: "EMAIL_E_SLACK",
      sentAt: new Date(Date.now() - horasAtras * 3_600_000),
    },
  });
}

const avisos = (email: string) => emailsEnviados.filter((destino) => destino === email).length;
const contarAlertas = (contratoId: string) => prisma.contractAlert.count({ where: { contractId: contratoId } });

/** Contract não é coberto por cleanupTestData, e prende o User pela FK. */
async function limparContratos() {
  const contratos = await prisma.contract.findMany({
    where: { supplierName: { contains: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = contratos.map((c) => c.id);
  if (ids.length === 0) return;
  await prisma.contractAlert.deleteMany({ where: { contractId: { in: ids } } });
  await prisma.contract.deleteMany({ where: { id: { in: ids } } });
}

describe("GET /api/cron/contract-alerts: cadência semanal", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    vi.stubEnv("CRON_SECRET", SEGREDO);
    // A cadência é comportamento de PRODUÇÃO: fora dela o cron simula, não
    // grava ContractAlert, e é justamente o registro do alerta que define a
    // janela semanal. Sem declarar o ambiente, este arquivo mediria o caminho
    // simulado e afirmaria coisas sobre uma cadência que não aconteceu.
    vi.stubEnv("APP_ENV", "producao");
    emailsEnviados.length = 0;
    slacksEnviados.length = 0;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await limparContratos();
    await cleanupTestData();
  });

  it("avisa o gestor de contrato que ainda não recebeu nenhum alerta", async () => {
    const { contrato, gestor } = await criarContratoAVencer();

    const res = await rodarCron();

    expect(res.status).toBe(200);
    expect(avisos(gestor.email)).toBe(1);
    expect(slacksEnviados.filter((e) => e === gestor.email).length).toBe(1);
    expect(await contarAlertas(contrato.id)).toBe(1);
  });

  it("não duplica o aviso quando o cron roda duas vezes no mesmo dia", async () => {
    const { contrato, gestor } = await criarContratoAVencer();

    await rodarCron();
    await rodarCron();

    // Antes da correção saíam dois e-mails e dois registros: a rota enviava em
    // toda chamada, sem guarda de repetição.
    expect(avisos(gestor.email)).toBe(1);
    expect(await contarAlertas(contrato.id)).toBe(1);
  });

  it("não reenvia dentro da mesma semana, mesmo em dias diferentes", async () => {
    const { contrato, gestor } = await criarContratoAVencer();
    await registrarAlertaAntigo(contrato.id, 5 * 24);

    await rodarCron();

    expect(avisos(gestor.email)).toBe(0);
    expect(await contarAlertas(contrato.id)).toBe(1);
  });

  it("volta a avisar quando o último aviso já passou de uma semana", async () => {
    const { contrato, gestor } = await criarContratoAVencer();
    await registrarAlertaAntigo(contrato.id, 8 * 24);

    await rodarCron();

    expect(avisos(gestor.email)).toBe(1);
    expect(await contarAlertas(contrato.id)).toBe(2);
  });

  it("não pula a semana quando o agendador roda um pouco mais cedo que na semana anterior", async () => {
    // A armadilha do corte exato: com o limite cravado em 7 dias, uma execução
    // semanal que caísse 1 hora mais cedo veria "6d23h < 7d", pularia a vez e a
    // cadência prometida viraria quinzenal. A janela tem folga justamente
    // porque o horário do agendador não é o mesmo instante toda semana.
    const { contrato, gestor } = await criarContratoAVencer();
    await registrarAlertaAntigo(contrato.id, 7 * 24 - 1);

    await rodarCron();

    expect(avisos(gestor.email)).toBe(1);
    expect(await contarAlertas(contrato.id)).toBe(2);
  });

  it("continua ignorando contrato cuja renovação está além dos 3 meses", async () => {
    const { contrato, gestor } = await criarContratoAVencer(200);

    await rodarCron();

    expect(avisos(gestor.email)).toBe(0);
    expect(await contarAlertas(contrato.id)).toBe(0);
  });

  it("recusa chamada sem credencial de máquina e não avisa ninguém", async () => {
    const { contrato, gestor } = await criarContratoAVencer();

    const res = await rodarCron(null);

    expect(res.status).toBe(401);
    expect(avisos(gestor.email)).toBe(0);
    expect(await contarAlertas(contrato.id)).toBe(0);
  });

  it("recusa credencial de máquina errada", async () => {
    const { contrato, gestor } = await criarContratoAVencer();

    const res = await rodarCron("Bearer segredo-errado-de-tamanho-igual!");

    expect(res.status).toBe(401);
    expect(avisos(gestor.email)).toBe(0);
    expect(await contarAlertas(contrato.id)).toBe(0);
  });
});
