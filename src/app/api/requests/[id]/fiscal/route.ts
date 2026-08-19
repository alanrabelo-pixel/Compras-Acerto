import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { avancarEtapa, notificarAvancoDeEtapa } from "@/lib/etapa";

/**
 * PATCH /api/requests/[id]/fiscal
 *
 * Validação fiscal do documento (nota fiscal). Avança para Tesouraria
 * quando approved = true.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const request = await prisma.purchaseRequest.findUnique({ where: { id: params.id } });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "FISCAL") {
    return NextResponse.json(
      { error: "Esta solicitação não está na etapa de Validação Fiscal. Recarregue a página para ver o estado atual." },
      { status: 409 }
    );
  }

  const body = await req.json();
  const { actorId, documentUrl, approved, reviewComment } = body;

  const roleError = await requireRole(actorId, ["FISCAL"]);
  if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

  if (!documentUrl) {
    return NextResponse.json({ error: "Informe o link do documento fiscal para registrar a validação." }, { status: 400 });
  }

  await prisma.fiscalDocument.upsert({
    where: { requestId: request.id },
    update: { documentUrl, approved, reviewComment, decidedAt: new Date() },
    create: { requestId: request.id, documentUrl, approved, reviewComment, decidedAt: new Date() },
  });

  // Documento reprovado permanece nesta etapa, aguardando novo envio.
  if (!approved) {
    return NextResponse.json({ status: "DOCUMENTO_REPROVADO" });
  }

  // A checagem de etapa acima é só para responder cedo com mensagem clara. O
  // guard que vale é o de avancarEtapa, que é condição do próprio UPDATE: se
  // outra pessoa mover a solicitação entre uma coisa e outra, quem chega
  // depois recebe 409 em vez de escrever por cima.
  const avanco = await avancarEtapa({
    requestId: request.id,
    de: "FISCAL",
    para: "TESOURARIA",
    actorId,
  });
  if (!avanco.ok) {
    return NextResponse.json({ error: avanco.erro }, { status: avanco.status });
  }

  await notificarAvancoDeEtapa(avanco.solicitacao, "TESOURARIA");

  return NextResponse.json(avanco.solicitacao);
}
