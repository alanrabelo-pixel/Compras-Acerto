import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
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
 *
 * costCenterId é opcional (a pessoa pode escrever a descrição antes de
 * escolher o centro de custo): quando presente, busca solicitações ABERTAS
 * do mesmo centro para a IA checar duplicidade antes do envio.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { description, costCenterId } = body as { description: string; costCenterId?: string };

  if (!description || description.trim().length < 10) {
    return NextResponse.json({ error: "Descreva sua necessidade com um pouco mais de detalhe (mínimo 10 caracteres)." }, { status: 422 });
  }

  const openRequestsInCostCenter = costCenterId
    ? await prisma.purchaseRequest.findMany({
        where: { costCenterId, currentStage: { notIn: ["CONCLUIDO", "CANCELADO"] } },
        select: { code: true, shortDescription: true, longDescription: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      })
    : [];

  const { payload, error } = await generateRequisitionAssist(description, openRequestsInCostCenter);

  if (!payload) return NextResponse.json({ error: error ?? "Não foi possível gerar sugestões." }, { status: 502 });
  return NextResponse.json(payload);
}
