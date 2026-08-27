import { NextRequest, NextResponse } from "next/server";
import { generateRequisitionAssist } from "@/lib/integrations/ai";

/**
 * POST /api/requests/suggest: assistente de preenchimento da Nova
 * Solicitação. Diferente de /api/requests/[id]/ai-insight, não persiste nada
 * (não existe PurchaseRequest ainda nesta etapa). É só uma sugestão
 * stateless que a pessoa confirma ou edita antes de enviar o formulário.
 *
 * Não identifica quem está pedindo: a chamada usa a chave única da empresa
 * (ver src/lib/integrations/ai.ts), não uma chave pessoal, então não há mais
 * cota nem conta de ninguém em jogo aqui.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { description } = body as { description: string };

  if (!description || description.trim().length < 10) {
    return NextResponse.json({ error: "Descreva sua necessidade com um pouco mais de detalhe (mínimo 10 caracteres)." }, { status: 422 });
  }

  const { payload, error } = await generateRequisitionAssist(description);

  if (!payload) return NextResponse.json({ error: error ?? "Não foi possível gerar sugestões." }, { status: 502 });
  return NextResponse.json(payload);
}
