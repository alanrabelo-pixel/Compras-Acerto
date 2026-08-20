import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { TEST_PREFIX, createTestUser, createTestCostCenter, createTestRequest, cleanupTestData } from "@/test-helpers/fixtures";

/**
 * Trava de envio fora de produção.
 *
 * O sistema vai passar a rodar em dois projetos separados na Vercel, Produção
 * e Sandbox. Antes desta trava, nem gmail.ts nem slack.ts perguntavam em que
 * ambiente estavam: bastava a credencial estar presente para enviar. E ela
 * está: o .env em uso já tem um SLACK_BOT_TOKEN real do workspace da Acerto.
 * Um Sandbox com cópia das variáveis, que é o jeito normal de montar um
 * Sandbox, mandaria e-mail assinado como compras@acerto.com.br e DM para
 * aprovadores de verdade, com dados de teste.
 *
 * Os dois clientes externos são mockados aqui porque o que precisa ser provado
 * não é que o Gmail e o Slack funcionem, e sim que fora de produção eles NÃO
 * são chamados. O Notification é gravado no banco de verdade: o registro do
 * que teria sido enviado é metade da correção, então testá-lo contra um mock
 * não provaria nada.
 */

const gmailChamadas = vi.hoisted(() => ({ enviados: [] as { raw?: string }[] }));
const slackChamadas = vi.hoisted(() => ({ lookups: [] as string[], postagens: [] as unknown[] }));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      JWT: class {
        constructor(_config: unknown) {}
      },
    },
    gmail: () => ({
      users: {
        messages: {
          send: async (arg: { requestBody?: { raw?: string } }) => {
            gmailChamadas.enviados.push({ raw: arg.requestBody?.raw });
            return {};
          },
        },
      },
    }),
  },
}));

vi.mock("@slack/web-api", () => ({
  WebClient: class {
    users = {
      lookupByEmail: async ({ email }: { email: string }) => {
        slackChamadas.lookups.push(email);
        return { user: { id: "U_TESTE" } };
      },
      info: async () => ({ user: { profile: { email: "quem@acerto.com.br", real_name: "Quem" } } }),
    };
    chat = {
      postMessage: async (arg: unknown) => {
        slackChamadas.postagens.push(arg);
        return { ts: "1700000000.000100" };
      },
    };
  },
}));

const { sendPurchaseEmail, remetente } = await import("./gmail");
const { sendSlackDM, sendSlackThreadDM } = await import("./slack");
const { destinoControladoria } = await import("@/lib/destinatarios");

const MARCADOR = "BLOQUEADO_FORA_DE_PRODUCAO";
const CAIXA_REAL_COMPRAS = "compras@acerto.com.br";
const CAIXA_REAL_CONTROLADORIA = "controladoria@acerto.com.br";

/** Destinatário carimbado com o prefixo do arquivo, para o cleanup achar depois. */
function destinatarioDeTeste(rotulo: string) {
  return `${TEST_PREFIX}${rotulo}@teste.acerto.com.br`;
}

async function notificacaoDe(recipient: string) {
  return prisma.notification.findFirst({ where: { recipient }, orderBy: { createdAt: "desc" } });
}

describe("trava de envio fora de produção", () => {
  beforeEach(() => {
    gmailChamadas.enviados.length = 0;
    slackChamadas.lookups.length = 0;
    slackChamadas.postagens.length = 0;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    // Notification não é filha de nada que cleanupTestData apague: a FK de
    // requestId é ON DELETE SET NULL, então apagar a solicitação deixaria a
    // linha órfã no banco de desenvolvimento. Apagar por prefixo antes.
    await prisma.notification.deleteMany({ where: { recipient: { contains: TEST_PREFIX } } });
    await cleanupTestData();
  });

  describe("e-mail (sendPurchaseEmail)", () => {
    it("no Sandbox não chama o Gmail e registra o que teria sido enviado", async () => {
      vi.stubEnv("APP_ENV", "sandbox");
      const to = destinatarioDeTeste("email-sandbox");

      await sendPurchaseEmail({ to, subject: "Aprovada a Solicitação de Compra", html: "<p>corpo</p>" });

      expect(gmailChamadas.enviados, "nada pode sair do Gmail fora de produção").toHaveLength(0);

      const registro = await notificacaoDe(to);
      expect(registro, "o bloqueio precisa ficar registrado, não sumir em silêncio").not.toBeNull();
      expect(registro?.channel).toBe("EMAIL");
      // FALHA e não ENVIADO: registrar ENVIADO sem ter enviado é pior que não
      // registrar, porque afirma uma entrega que não houve.
      expect(registro?.status).toBe("FALHA");
      expect(registro?.subject).toContain(MARCADOR);
      expect(registro?.subject).toContain("Aprovada a Solicitação de Compra");
    });

    it("ambiente não declarado se comporta como Sandbox", async () => {
      vi.stubEnv("APP_ENV", undefined);
      const to = destinatarioDeTeste("email-sem-app-env");

      await sendPurchaseEmail({ to, subject: "Sem APP_ENV", html: "<p>corpo</p>" });

      expect(gmailChamadas.enviados).toHaveLength(0);
      expect((await notificacaoDe(to))?.status).toBe("FALHA");
    });

    it("APP_ENV com valor inválido não vira permissão de envio", async () => {
      vi.stubEnv("APP_ENV", "prod");
      const to = destinatarioDeTeste("email-app-env-invalido");

      await sendPurchaseEmail({ to, subject: "APP_ENV inválido", html: "<p>corpo</p>" });

      expect(gmailChamadas.enviados).toHaveLength(0);
    });

    it("a trava não lança, para não quebrar rota que chama sem .catch", async () => {
      vi.stubEnv("APP_ENV", "sandbox");
      const to = destinatarioDeTeste("email-nao-lanca");

      await expect(
        sendPurchaseEmail({ to, subject: "Não pode lançar", html: "<p>corpo</p>" })
      ).resolves.toBeUndefined();
    });

    it("liga o bloqueio à solicitação, para a auditoria encontrar depois", async () => {
      vi.stubEnv("APP_ENV", "sandbox");
      const solicitante = await createTestUser([]);
      const gestor = await createTestUser(["APROVADOR"]);
      const centro = await createTestCostCenter();
      const solicitacao = await createTestRequest({
        requesterId: solicitante.id,
        approverManagerId: gestor.id,
        costCenterId: centro.id,
        currentStage: "TRIAGEM",
      });
      const to = destinatarioDeTeste("email-com-solicitacao");

      await sendPurchaseEmail({ to, subject: "Com solicitação", html: "<p>corpo</p>", requestId: solicitacao.id });

      const registro = await notificacaoDe(to);
      expect(registro?.requestId).toBe(solicitacao.id);
    });

    it("em produção continua enviando de verdade", async () => {
      vi.stubEnv("APP_ENV", "producao");
      const to = destinatarioDeTeste("email-producao");

      await sendPurchaseEmail({ to, subject: "Envio real", html: "<p>corpo</p>" });

      expect(gmailChamadas.enviados, "a trava não pode calar a produção").toHaveLength(1);
      expect((await notificacaoDe(to))?.status).toBe("ENVIADO");
    });
  });

  describe("Slack (sendSlackDM)", () => {
    it("no Sandbox não chama o Slack e registra o que teria sido enviado", async () => {
      vi.stubEnv("APP_ENV", "sandbox");
      const destino = destinatarioDeTeste("slack-sandbox");

      await sendSlackDM({ slackUserEmail: destino, text: "Aprovação pendente há 3 dias" });

      expect(slackChamadas.lookups, "nem o lookup de usuário pode acontecer").toHaveLength(0);
      expect(slackChamadas.postagens, "nenhuma DM pode sair fora de produção").toHaveLength(0);

      const registro = await notificacaoDe(destino);
      expect(registro).not.toBeNull();
      expect(registro?.channel).toBe("SLACK");
      expect(registro?.status).toBe("FALHA");
      expect(registro?.subject).toContain(MARCADOR);
      expect(registro?.subject).toContain("Aprovação pendente");
    });

    it("a trava NÃO lança, apesar de o catch da função re-lançar", async () => {
      // Assimetria conhecida: o catch de sendSlackDM re-lança, e há rota que
      // chama sem .catch (o cron de escalonamento). Se a trava lançasse, o
      // Sandbox quebraria e a saída óbvia seria colar o token real para
      // "resolver", que é o contrário do que a trava garante.
      vi.stubEnv("APP_ENV", "sandbox");
      const destino = destinatarioDeTeste("slack-nao-lanca");

      await expect(sendSlackDM({ slackUserEmail: destino, text: "Não pode lançar" })).resolves.toBeUndefined();
    });

    it("em produção continua enviando de verdade", async () => {
      vi.stubEnv("APP_ENV", "producao");
      const destino = destinatarioDeTeste("slack-producao");

      await sendSlackDM({ slackUserEmail: destino, text: "Envio real" });

      expect(slackChamadas.postagens, "a trava não pode calar a produção").toHaveLength(1);
      expect((await notificacaoDe(destino))?.status).toBe("ENVIADO");
    });
  });

  describe("Slack do widget de chat (sendSlackThreadDM)", () => {
    it("no Sandbox não espelha a mensagem para a pessoa real", async () => {
      vi.stubEnv("APP_ENV", "sandbox");

      // Aqui a trava lança de propósito: a função devolve channel/ts que o
      // chamador grava para casar a resposta do Slack de volta com a
      // solicitação, e IDs inventados envenenariam esse casamento. O único
      // chamador (src/lib/requestChat.ts) já trata exceção como "não
      // espelhou, segue registrado no app".
      await expect(
        sendSlackThreadDM({ email: destinatarioDeTeste("slack-thread"), text: "mensagem do chat" })
      ).rejects.toThrow(MARCADOR);

      expect(slackChamadas.postagens).toHaveLength(0);
    });

    it("em produção continua espelhando", async () => {
      vi.stubEnv("APP_ENV", "producao");

      const res = await sendSlackThreadDM({ email: destinatarioDeTeste("slack-thread-prod"), text: "mensagem" });

      expect(slackChamadas.postagens).toHaveLength(1);
      expect(res.ts).toBeTruthy();
    });
  });

  describe("remetente do Gmail", () => {
    it("no Sandbox não assina como a caixa real de Compras", () => {
      vi.stubEnv("APP_ENV", "sandbox");
      vi.stubEnv("GMAIL_SENDER", undefined);

      expect(remetente()).not.toBe(CAIXA_REAL_COMPRAS);
      expect(remetente(), "domínio reservado, não entregável").toContain(".invalid");
    });

    it("em produção mantém o endereço histórico sem exigir configuração nova", () => {
      vi.stubEnv("APP_ENV", "producao");
      vi.stubEnv("GMAIL_SENDER", undefined);

      expect(remetente()).toBe(CAIXA_REAL_COMPRAS);
    });

    it("GMAIL_SENDER vence o padrão nos dois ambientes", () => {
      vi.stubEnv("GMAIL_SENDER", "compras-sandbox@acerto.com.br");

      vi.stubEnv("APP_ENV", "sandbox");
      expect(remetente()).toBe("compras-sandbox@acerto.com.br");

      vi.stubEnv("APP_ENV", "producao");
      expect(remetente()).toBe("compras-sandbox@acerto.com.br");
    });
  });

  describe("destino da Controladoria", () => {
    it("no Sandbox não cai na caixa real da Controladoria", () => {
      vi.stubEnv("APP_ENV", "sandbox");
      vi.stubEnv("EMAIL_CONTROLADORIA", undefined);

      expect(destinoControladoria()).not.toBe(CAIXA_REAL_CONTROLADORIA);
      expect(destinoControladoria()).toContain(".invalid");
    });

    it("em produção mantém a caixa real, sem exigir a variável", () => {
      vi.stubEnv("APP_ENV", "producao");
      vi.stubEnv("EMAIL_CONTROLADORIA", undefined);

      expect(destinoControladoria()).toBe(CAIXA_REAL_CONTROLADORIA);
    });

    it("EMAIL_CONTROLADORIA vence o padrão", () => {
      vi.stubEnv("APP_ENV", "sandbox");
      vi.stubEnv("EMAIL_CONTROLADORIA", "controladoria-teste@acerto.com.br");

      expect(destinoControladoria()).toBe("controladoria-teste@acerto.com.br");
    });
  });
});
