/**
 * Integração Slack, usada para os mesmos eventos-chave do e-mail (aprovações,
 * mudanças de etapa, alertas de renovação de contrato), com foco em quem
 * precisa agir rápido (aprovadores, compradores).
 *
 * Assunção não verificada: preferimos um Slack App com Bot Token (chat:write)
 * a webhooks de canal fixo, porque o fluxo precisa enviar DM para aprovadores
 * específicos (ex: "Gestor Aprovador" mencionado na solicitação), não só postar
 * em um canal público. Confirmar com o admin do workspace Slack da Acerto se
 * já existe um app interno que possamos reaproveitar.
 */

import { WebClient } from "@slack/web-api";
import { prisma } from "../db";
import { ehProducao } from "../ambiente";
import { logger } from "../logger";

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

/**
 * Marcador gravado em Notification.subject quando a trava barra o envio.
 *
 * Não existe status próprio para "bloqueado": a CHECK do banco
 * (Notification_status_valido) só aceita ENVIADO e FALHA, e inventar um
 * terceiro valor exigiria migration. FALHA é o único honesto dos dois, porque
 * nada saiu. O motivo fica no subject e no log.
 */
const MOTIVO_BLOQUEIO = "BLOQUEADO_FORA_DE_PRODUCAO";

/** Recorta o texto para o log e para o registro, que não precisam da mensagem inteira. */
function previaDoTexto(texto: string, limite = 280): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length > limite ? `${limpo.slice(0, limite)}...` : limpo;
}

/**
 * Envia uma DM "encadeada" (thread_ts) para o widget de chat comprador ↔
 * solicitante (ver src/components/RequestChatWidget.tsx). Diferente de
 * sendSlackDM abaixo, devolve channel/ts em vez de só logar Notification:
 * são esses IDs que permitem casar a resposta do Slack de volta com a
 * solicitação certa (ver src/app/api/slack/events/route.ts).
 */
export async function sendSlackThreadDM(params: { email: string; text: string; threadTs?: string }) {
  // Mesma trava de ambiente de sendSlackDM. Este caminho não estava no
  // levantamento, mas manda DM pelo mesmo bot e pelo mesmo token, então sem
  // guarda aqui a promessa "o Sandbox não manda Slack para lugar nenhum"
  // seria falsa: o widget de chat continuaria alcançando pessoas de verdade.
  //
  // Aqui a trava LANÇA, ao contrário da de sendSlackDM, e é proposital: a
  // função devolve channel/ts que o chamador grava para casar a resposta do
  // Slack de volta com a solicitação (ver src/lib/requestChat.ts). Devolver
  // IDs inventados envenenaria esse casamento. Lançar já é o contrato desta
  // função (ver o throw de usuário não encontrado logo abaixo) e o único
  // chamador trata a exceção como "não espelhou, segue registrado no app".
  if (!ehProducao()) {
    logger.warn("slack_bloqueado_fora_de_producao", {
      motivo: MOTIVO_BLOQUEIO,
      origem: "sendSlackThreadDM",
      destinatario: params.email,
      previaDoTexto: previaDoTexto(params.text),
    });
    throw new Error(`${MOTIVO_BLOQUEIO}: DM de chat não enviada para ${params.email} fora de produção.`);
  }

  const user = await slack.users.lookupByEmail({ email: params.email });
  const channel = user.user?.id;
  if (!channel) throw new Error(`Usuário Slack não encontrado para ${params.email}`);

  const res = await slack.chat.postMessage({
    channel,
    text: params.text,
    thread_ts: params.threadTs,
  });

  return { channel, ts: res.ts as string, threadTs: params.threadTs ?? (res.ts as string) };
}

/** Usado pelo webhook de eventos do Slack para descobrir quem mandou uma DM. */
export async function lookupSlackUser(slackUserId: string): Promise<{ email: string; name: string } | null> {
  const info = await slack.users.info({ user: slackUserId });
  const email = info.user?.profile?.email;
  if (!email) return null;
  const name = info.user?.profile?.real_name ?? info.user?.real_name ?? email;
  return { email, name };
}

/**
 * Registra uma DM que a trava barrou. NUNCA lança, nem quando o próprio
 * registro falha.
 *
 * Isto é deliberadamente diferente do catch de sendSlackDM, que re-lança. Uma
 * exceção aqui quebraria no Sandbox rotas que chamam sendSlackDM sem .catch
 * (ex: src/app/api/cron/approval-escalation/route.ts), e a saída óbvia para
 * quem visse o Sandbox quebrado seria colar o token real do Slack para
 * "resolver", que é exatamente o contrário do que esta trava existe para
 * garantir.
 */
async function registrarEnvioBloqueado(params: {
  slackUserEmail: string;
  text: string;
  requestId?: string;
}) {
  logger.warn("slack_bloqueado_fora_de_producao", {
    motivo: MOTIVO_BLOQUEIO,
    destinatario: params.slackUserEmail,
    requestId: params.requestId,
    previaDoTexto: previaDoTexto(params.text),
  });

  try {
    await prisma.notification.create({
      data: {
        requestId: params.requestId,
        channel: "SLACK",
        recipient: params.slackUserEmail,
        subject: `[${MOTIVO_BLOQUEIO}] ${previaDoTexto(params.text, 120)}`,
        status: "FALHA",
      },
    });
  } catch (err) {
    logger.error("falha_ao_registrar_slack_bloqueado", {
      destinatario: params.slackUserEmail,
      erro: err as Error,
    });
  }
}

export async function sendSlackDM(params: {
  slackUserEmail: string;
  text: string;
  requestId?: string;
}) {
  // Trava de ambiente. Fora de produção não sai DM para lugar nenhum: nem
  // para a pessoa real, nem para um canal alternativo. Falha fechada, antes
  // do lookupByEmail, e sem lançar.
  //
  // A checagem é de APP_ENV (src/lib/ambiente.ts), não da presença do token e
  // não de NODE_ENV. Token presente não é permissão para enviar: o .env desta
  // máquina já tem um SLACK_BOT_TOKEN real do workspace da Acerto, então hoje
  // qualquer execução fora de produção alcança pessoas de verdade.
  if (!ehProducao()) {
    await registrarEnvioBloqueado(params);
    return;
  }

  try {
    const user = await slack.users.lookupByEmail({ email: params.slackUserEmail });
    const userId = user.user?.id;
    if (!userId) throw new Error(`Usuário Slack não encontrado para ${params.slackUserEmail}`);

    await slack.chat.postMessage({ channel: userId, text: params.text });

    await prisma.notification.create({
      data: {
        requestId: params.requestId,
        channel: "SLACK",
        recipient: params.slackUserEmail,
        status: "ENVIADO",
      },
    });
  } catch (err) {
    await prisma.notification.create({
      data: {
        requestId: params.requestId,
        channel: "SLACK",
        recipient: params.slackUserEmail,
        status: "FALHA",
      },
    });
    throw err;
  }
}
