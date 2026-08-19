import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { avancarEtapa, notificarAvancoDeEtapa } from "@/lib/etapa";

/**
 * PATCH /api/requests/[id]/juridico
 *
 * Elaboração/assinatura da minuta contratual. Só avança para Pedido de
 * Compra quando o documento estiver assinado (signed = true).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: { requester: true },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "JURIDICO") {
    return NextResponse.json({ error: "Solicitação não está na etapa de Jurídico" }, { status: 409 });
  }

  const body = await req.json();
  const { actorId, minutaUrl, signedDocUrl, signed, observations } = body;

  const roleError = await requireRole(actorId, ["JURIDICO"]);
  if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

  await prisma.legalReview.upsert({
    where: { requestId: request.id },
    update: { minutaUrl, signedDocUrl, signed, observations, decidedAt: signed ? new Date() : undefined },
    create: { requestId: request.id, minutaUrl, signedDocUrl, signed, observations, decidedAt: signed ? new Date() : undefined },
  });

  if (!signed) {
    return NextResponse.json({ status: "MINUTA_EM_ANDAMENTO" });
  }

  // CANCELAMENTO não compra nada e não mapeia contrato novo, pois o contrato já
  // existe e já está mapeado (pedido do usuário); depois de assinado o
  // distrato/termo de cancelamento, encerra direto. A baixa do contrato em si
  // (status CANCELADO) é feita separadamente em Contratos, ação CANCELAR
  // (ver /api/contracts/[id]), não faz parte deste fluxo de solicitação.
  const isCancelamento = request.demandType === "CANCELAMENTO";
  const nextStage = isCancelamento ? "CONCLUIDO" : "PEDIDO_COMPRA";

  const avanco = await avancarEtapa({
    requestId: request.id,
    de: "JURIDICO",
    para: nextStage,
    actorId,
    dadosExtras: isCancelamento ? { status: "CONCLUIDO" } : undefined,
  });
  if (!avanco.ok) {
    return NextResponse.json({ error: avanco.erro }, { status: avanco.status });
  }

  await notificarAvancoDeEtapa(avanco.solicitacao, nextStage);

  return NextResponse.json(avanco.solicitacao);
}
