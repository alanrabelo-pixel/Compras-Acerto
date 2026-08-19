import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { lookupSlackUser } from "@/lib/integrations/slack";
import { resolveChatFromSlackEvent, createSlackChatMessage } from "@/lib/requestChat";

export const runtime = "nodejs";

/**
 * Webhook da Events API do Slack: recebe as respostas que o comprador ou o
 * solicitante mandam por DM e devolve para o widget de chat da solicitação
 * (ver src/components/RequestChatWidget.tsx e src/lib/requestChat.ts).
 *
 * Pré-requisitos que NÃO existem ainda neste ambiente local (mesma limitação
 * do SSO/Google OAuth, ver .env): um Slack App real com Bot Token
 * (SLACK_BOT_TOKEN), assinatura configurada (SLACK_SIGNING_SECRET) e, como o
 * Slack não aceita localhost, uma URL pública (deploy ou túnel tipo ngrok)
 * cadastrada em "Event Subscriptions" com escopo `message.im`. Até lá este
 * endpoint fica pronto mas inatingível de fora.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!verifySignature(req, rawBody)) {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);

  // Handshake exigido pelo Slack ao cadastrar a URL do endpoint.
  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  if (payload.type === "event_callback") {
    const event = payload.event;
    // channel_type "im" = DM direta; ignoramos mensagens do próprio bot e edições/deleções.
    if (event?.type === "message" && event.channel_type === "im" && !event.subtype && !event.bot_id) {
      await handleIncomingDM(event);
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleIncomingDM(event: { channel: string; user: string; text: string; ts: string; thread_ts?: string }) {
  const sender = await lookupSlackUser(event.user);
  if (!sender) return; // sem e-mail no perfil Slack: não dá para casar com requester/buyer

  const resolved = await resolveChatFromSlackEvent({
    channel: event.channel,
    threadTs: event.thread_ts,
    senderEmail: sender.email,
  });
  if (!resolved) return; // não achamos a solicitação/thread correspondente

  await createSlackChatMessage({
    requestId: resolved.requestId,
    role: resolved.role,
    authorName: sender.name,
    body: event.text,
    channel: event.channel,
    ts: event.ts,
    threadTs: event.thread_ts ?? event.ts,
  });
}

function verifySignature(req: NextRequest, rawBody: string): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return true; // sem segredo configurado ainda neste ambiente local, ver comentário no topo do arquivo

  const timestamp = req.headers.get("x-slack-request-timestamp");
  const signature = req.headers.get("x-slack-signature");
  if (!timestamp || !signature) return false;

  // Proteção contra replay: rejeita requisições com mais de 5 minutos.
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${crypto.createHmac("sha256", secret).update(base).digest("hex")}`;
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}
