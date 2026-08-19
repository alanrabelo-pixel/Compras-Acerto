import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { nextAfterTesouraria } from "@/lib/workflow";
import { avancarEtapa, notificarAvancoDeEtapa } from "@/lib/etapa";

/**
 * PATCH /api/requests/[id]/tesouraria
 *
 * Programação/confirmação de pagamento. Ao confirmar erpConfirmed=true,
 * avança para Mapeamento de Contrato (se needsMapping) ou Concluído.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const request = await prisma.purchaseRequest.findUnique({ where: { id: params.id } });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "TESOURARIA") {
    return NextResponse.json(
      { error: "Esta solicitação não está na etapa de Tesouraria. Recarregue a página para ver o estado atual." },
      { status: 409 }
    );
  }

  const body = await req.json();
  const { actorId, scheduledDate, paidDate, status, erpConfirmed } = body;

  const roleError = await requireRole(actorId, ["TESOURARIA"]);
  if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

  await prisma.payment.upsert({
    where: { requestId: request.id },
    update: {
      scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
      paidDate: paidDate ? new Date(paidDate) : undefined,
      status,
      erpConfirmed: Boolean(erpConfirmed),
    },
    create: {
      requestId: request.id,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
      paidDate: paidDate ? new Date(paidDate) : undefined,
      status: status ?? "PROGRAMADO",
      erpConfirmed: Boolean(erpConfirmed),
    },
  });

  if (!erpConfirmed) {
    return NextResponse.json({ status: "PAGAMENTO_PROGRAMADO" });
  }

  const nextStage = nextAfterTesouraria({ needsMapping: Boolean(request.needsMapping) });

  const avanco = await avancarEtapa({
    requestId: request.id,
    de: "TESOURARIA",
    para: nextStage,
    actorId,
    dadosExtras: nextStage === "CONCLUIDO" ? { status: "CONCLUIDO" } : undefined,
  });
  if (!avanco.ok) {
    return NextResponse.json({ error: avanco.erro }, { status: avanco.status });
  }

  await notificarAvancoDeEtapa(avanco.solicitacao, nextStage);

  return NextResponse.json(avanco.solicitacao);
}
