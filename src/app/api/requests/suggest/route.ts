import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { generateRequisitionAssist } from "@/lib/integrations/ai";
import { atorDaSessao } from "@/lib/acesso";

/**
 * POST /api/requests/suggest: assistente de preenchimento da Nova
 * Solicitação. Diferente de /api/requests/[id]/ai-insight, não persiste nada
 * (não existe PurchaseRequest ainda nesta etapa). É só uma sugestão
 * stateless que a pessoa confirma ou edita antes de enviar o formulário.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { requesterId, description } = body as { requesterId: string; description: string };

  // De quem é a chave que vai ser gasta: a SESSÃO manda, o corpo só entra
  // quando não há sessão nenhuma (desenvolvimento local com LOCAL_BYPASS_AUTH,
  // onde o formulário escolhe o solicitante no UserPicker).
  //
  // Aqui não é só o nome no registro que estava em jogo. requesterId vinha do
  // corpo e a rota carregava a CHAVE PESSOAL de IA daquele id (Anthropic e
  // Gemini, ver /api/users/[id]/ai-keys) para chamar o modelo. Com um id
  // qualquer no corpo, qualquer conta autenticada gastava a chave, e a cota,
  // de outra pessoa, sem que ela visse nada. A chave nunca volta na resposta,
  // então o único jeito de fechar isso é não deixar o chamador escolher de
  // quem ela é.
  const ator = await atorDaSessao();
  const solicitanteId = ator?.id ?? requesterId;

  if (!solicitanteId) return NextResponse.json({ error: "Selecione o solicitante antes de pedir sugestões." }, { status: 422 });
  if (!description || description.trim().length < 10) {
    return NextResponse.json({ error: "Descreva sua necessidade com um pouco mais de detalhe (mínimo 10 caracteres)." }, { status: 422 });
  }

  const actor = await prisma.user.findUnique({
    where: { id: solicitanteId },
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
