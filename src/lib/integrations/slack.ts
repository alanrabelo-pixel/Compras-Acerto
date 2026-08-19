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

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

/**
 * Envia uma DM "encadeada" (thread_ts) para o widget de chat comprador ↔
 * solicitante (ver src/components/RequestChatWidget.tsx). Diferente de
 * sendSlackDM abaixo, devolve channel/ts em vez de só logar Notification:
 * são esses IDs que permitem casar a resposta do Slack de volta com a
 * solicitação certa (ver src/app/api/slack/events/route.ts).
 */
export async function sendSlackThreadDM(params: { email: string; text: string; threadTs?: string }) {
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

export async function sendSlackDM(params: {
  slackUserEmail: string;
  text: string;
  requestId?: string;
}) {
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
