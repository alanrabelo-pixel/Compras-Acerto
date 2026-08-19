import { prisma } from "@/lib/db";
import { sendSlackThreadDM } from "@/lib/integrations/slack";

/**
 * Chat flutuante comprador ↔ solicitante (widget "nuvem" no canto inferior
 * direito da solicitação). Mensagens enviadas pelo app tentam um espelho via
 * Slack DM para quem não está com a janela aberta; a resposta dessa pessoa no
 * próprio Slack volta para cá através do webhook de eventos (ver
 * src/app/api/slack/events/route.ts), sem exigir que ela abra o app de novo.
 */

export type ChatRole = "COMPRADOR" | "SOLICITANTE";

/** Cria a mensagem enviada pelo app e tenta espelhá-la via Slack DM para a outra parte. */
export async function createAppChatMessage(params: {
  requestId: string;
  authorRole: ChatRole;
  authorName: string;
  body: string;
}) {
  const message = await prisma.requestChatMessage.create({
    data: {
      requestId: params.requestId,
      authorRole: params.authorRole,
      authorName: params.authorName,
      body: params.body,
      source: "APP",
    },
  });

  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.requestId },
    include: { requester: true, buyer: true },
  });
  if (!request) return message;

  const recipient = params.authorRole === "COMPRADOR" ? request.requester : request.buyer;
  if (!recipient?.email) return message; // sem comprador/e-mail definido ainda: só fica registrado no app

  // Reaproveita a thread já aberta com essa pessoa para esta solicitação, se existir.
  const previous = await prisma.requestChatMessage.findFirst({
    where: { requestId: params.requestId, slackThreadTs: { not: null } },
    orderBy: { createdAt: "desc" },
  });

  try {
    const { channel, ts, threadTs } = await sendSlackThreadDM({
      email: recipient.email,
      text: `💬 *${params.authorName}* (${roleLabel(params.authorRole)}) sobre a solicitação ${request.code}:\n${params.body}\n\n_Responda esta mensagem no Slack: sua resposta volta automaticamente para o fluxo de compras._`,
      threadTs: previous?.slackThreadTs ?? undefined,
    });
    await prisma.requestChatMessage.update({
      where: { id: message.id },
      data: { slackChannelId: channel, slackTs: ts, slackThreadTs: threadTs },
    });
  } catch {
    // Sem token real do Slack configurado (ou usuário sem Slack): mensagem
    // já está registrada no app, só não foi espelhada. Mesmo padrão de
    // "falha silenciosa e registrada" usado em sendSlackDM/sendPurchaseEmail.
  }

  return message;
}

function roleLabel(role: ChatRole) {
  return role === "COMPRADOR" ? "comprador" : "solicitante";
}

/**
 * Resolve para qual solicitação/papel uma mensagem recebida via Slack
 * pertence. Prioridade: thread_ts exato (confiável) e, na ausência dele
 * (cliente Slack que não preserva thread em DM), a solicitação mais recente
 * com uma thread aberta nesse mesmo canal. ASSUNÇÃO NÃO VERIFICADA: um
 * fallback razoável, mas pode errar se a mesma pessoa tiver duas conversas
 * simultâneas sem usar "responder em thread".
 */
export async function resolveChatFromSlackEvent(params: {
  channel: string;
  threadTs?: string;
  senderEmail: string;
}) {
  if (params.threadTs) {
    const match = await prisma.requestChatMessage.findFirst({
      where: { slackThreadTs: params.threadTs },
      include: { request: { include: { requester: true, buyer: true } } },
    });
    if (match) return roleFor(match.request, params.senderEmail);
  }

  const fallback = await prisma.requestChatMessage.findFirst({
    where: { slackChannelId: params.channel },
    orderBy: { createdAt: "desc" },
    include: { request: { include: { requester: true, buyer: true } } },
  });
  if (fallback) return roleFor(fallback.request, params.senderEmail);

  return null;
}

/** Grava no app a resposta que chegou pelo Slack (ver src/app/api/slack/events/route.ts). */
export async function createSlackChatMessage(params: {
  requestId: string;
  role: ChatRole;
  authorName: string;
  body: string;
  channel: string;
  ts: string;
  threadTs: string;
}) {
  return prisma.requestChatMessage.create({
    data: {
      requestId: params.requestId,
      authorRole: params.role,
      authorName: params.authorName,
      body: params.body,
      source: "SLACK",
      slackChannelId: params.channel,
      slackTs: params.ts,
      slackThreadTs: params.threadTs,
    },
  });
}

function roleFor(
  request: { id: string; requester: { email: string }; buyer: { email: string } | null },
  senderEmail: string
): { requestId: string; role: ChatRole } | null {
  if (request.requester.email.toLowerCase() === senderEmail.toLowerCase()) {
    return { requestId: request.id, role: "SOLICITANTE" };
  }
  if (request.buyer?.email?.toLowerCase() === senderEmail.toLowerCase()) {
    return { requestId: request.id, role: "COMPRADOR" };
  }
  return null;
}
