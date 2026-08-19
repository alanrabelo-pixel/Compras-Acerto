import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";
import { POST } from "./route";

/**
 * Regressão do fail-open do webhook do Slack.
 *
 * verifySignature começava com `if (!secret) return true`, ou seja, a AUSÊNCIA
 * da variável transformava o endpoint em porta aberta: qualquer POST era aceito
 * como evento legítimo e injetava mensagem no chat entre comprador e
 * solicitante em nome de terceiros. O perigo é que nada quebra quando isso
 * acontece, tudo continua "funcionando", então um deploy onde a variável não
 * propagasse abriria o endpoint sem ninguém perceber.
 */

const SEGREDO = "segredo-de-teste";

function assinar(corpo: string, timestamp: string, segredo: string) {
  return `v0=${crypto.createHmac("sha256", segredo).update(`v0:${timestamp}:${corpo}`).digest("hex")}`;
}

function slackRequest(corpo: unknown, opts: { segredo?: string; timestamp?: string; assinatura?: string } = {}) {
  const raw = JSON.stringify(corpo);
  const timestamp = opts.timestamp ?? String(Math.floor(Date.now() / 1000));
  const headers = new Headers({ "Content-Type": "application/json" });
  const assinatura = opts.assinatura ?? (opts.segredo ? assinar(raw, timestamp, opts.segredo) : undefined);
  if (assinatura) {
    headers.set("x-slack-request-timestamp", timestamp);
    headers.set("x-slack-signature", assinatura);
  }
  return new NextRequest("http://localhost/api/slack/events", { method: "POST", headers, body: raw });
}

const handshake = { type: "url_verification", challenge: "abc" };

describe("POST /api/slack/events: verificação de assinatura", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejeita quando SLACK_SIGNING_SECRET não está configurada, em vez de aceitar tudo", async () => {
    vi.stubEnv("SLACK_SIGNING_SECRET", undefined);

    const res = await POST(slackRequest(handshake));

    expect(res.status).toBe(401);
  });

  it("rejeita evento forjado sem assinatura", async () => {
    vi.stubEnv("SLACK_SIGNING_SECRET", SEGREDO);

    const res = await POST(slackRequest(handshake));

    expect(res.status).toBe(401);
  });

  it("rejeita assinatura calculada com outro segredo", async () => {
    vi.stubEnv("SLACK_SIGNING_SECRET", SEGREDO);

    const res = await POST(slackRequest(handshake, { segredo: "segredo-errado" }));

    expect(res.status).toBe(401);
  });

  it("rejeita replay de requisição antiga", async () => {
    vi.stubEnv("SLACK_SIGNING_SECRET", SEGREDO);
    const antigo = String(Math.floor(Date.now() / 1000) - 3600);

    const res = await POST(slackRequest(handshake, { segredo: SEGREDO, timestamp: antigo }));

    expect(res.status).toBe(401);
  });

  it("aceita requisição assinada corretamente", async () => {
    vi.stubEnv("SLACK_SIGNING_SECRET", SEGREDO);

    const res = await POST(slackRequest(handshake, { segredo: SEGREDO }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ challenge: "abc" });
  });
});
