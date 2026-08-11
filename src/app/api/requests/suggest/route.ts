import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { generateRequisitionAssist } from "@/lib/integrations/ai";

/**
 * POST /api/requests/suggest — assistente de preenchimento da Nova
 * Solicitação. Diferente de /api/requests/[id]/ai-insight, não persiste nada
 * (não existe PurchaseRequest ainda nesta etapa) — é só uma sugestão
 * stateless que a pessoa confirma ou edita antes de enviar o formulário.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { requesterId, description } = body as { requesterId: string; description: string };

  if (!requesterId) return NextResponse.json({ error: "Selecione o solicitante antes de pedir sugestões." }, { status: 422 });
  if (!description || description.trim().length < 10) {
    return NextResponse.json({ error: "Descreva sua necessidade com um pouco mais de detalhe (mínimo 10 caracteres)." }, { status: 422 });
  }

  const actor = await prisma.user.findUnique({
    where: { id: requesterId },
    select: { anthropicApiKey: true, geminiApiKey: true },
  });
  if (!actor) return NextResponse.json({ error: "Solicitante não encontrado." }, { status: 404 });

  const { payload, error } = await generateRequisitionAssist(description, {
    anthropicApiKey: actor.anthropicApiKey ? decryptSecret(actor.anthropicApiKey) : null,
    geminiApiKey: actor.geminiApiKey ? decryptSecret(actor.geminiApiKey) : null,
  });

  if (!payload) return NextResponse.json({ error: error ?? "Não foi possível gerar sugestões." }, { status: 502 });
  return NextResponse.json(payload);
}
