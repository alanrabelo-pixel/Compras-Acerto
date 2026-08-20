import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { atorDaSessao, exigirLeituraDeSolicitacao, semAcesso } from "@/lib/acesso";

/**
 * POST /api/requests/[id]/avaliacao
 *
 * NPS do solicitante sobre o processo de compra concluído (0-10 + feedback
 * livre). Não bloqueia nem altera o fluxo, é só um registro de qualidade.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const barrado = await exigirLeituraDeSolicitacao(params.id);
  if (barrado) return barrado;

  const request = await prisma.purchaseRequest.findUnique({ where: { id: params.id } });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });

  // A nota é a experiência de quem pediu a compra, e o corpo não traz autor
  // nenhum: sem esta comparação, qualquer pessoa com acesso ao quadro (o
  // próprio comprador que conduziu, inclusive) grava a nota no lugar do
  // solicitante, e o upsert por requestId ainda sobrescreve a que ele já deu.
  // Havendo sessão ela manda; sem sessão (desenvolvimento com
  // LOCAL_BYPASS_AUTH) a guarda acima já liberou e o formulário local segue.
  const ator = await atorDaSessao();
  if (ator && ator.id !== request.requesterId) {
    return semAcesso("Só quem abriu esta solicitação pode avaliar o processo de compra.");
  }

  if (request.currentStage !== "CONCLUIDO") {
    return NextResponse.json({ error: "Avaliação só pode ser registrada após a conclusão da solicitação." }, { status: 409 });
  }

  const body = await req.json();
  const { score, feedback } = body;
  if (typeof score !== "number" || score < 0 || score > 10) {
    return NextResponse.json({ error: "Dê uma nota de 0 a 10 para a sua experiência." }, { status: 400 });
  }

  const evaluation = await prisma.supplierEvaluation.upsert({
    where: { requestId: request.id },
    update: { score, feedback },
    create: { requestId: request.id, score, feedback },
  });

  return NextResponse.json(evaluation, { status: 201 });
}
