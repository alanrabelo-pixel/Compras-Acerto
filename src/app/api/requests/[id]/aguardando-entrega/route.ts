import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { nextAfterAguardandoEntrega } from "@/lib/workflow";
import { avancarEtapa, notificarAvancoDeEtapa } from "@/lib/etapa";

/**
 * PATCH /api/requests/[id]/aguardando-entrega
 *
 * Confirma o recebimento/entrega e decide a próxima etapa: Medição (se
 * needsMeasurement), Mapeamento de Contrato (se needsMapping) ou Concluído.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: { purchaseOrder: true },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "AGUARDANDO_ENTREGA") {
    return NextResponse.json(
      { error: "Esta solicitação não está na etapa de Aguardando Entrega/Conclusão. Recarregue a página para ver o estado atual." },
      { status: 409 }
    );
  }

  const body = await req.json();
  const roleError = await requireRole(body.actorId, ["COMPRADOR"]);
  if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

  const needsMeasurement = body.needsMeasurement ?? request.purchaseOrder?.needsMeasurement ?? false;
  const needsMapping = body.needsMapping ?? request.needsMapping ?? false;

  const nextStage = nextAfterAguardandoEntrega({ needsMeasurement, needsMapping });

  const avanco = await avancarEtapa({
    requestId: request.id,
    de: "AGUARDANDO_ENTREGA",
    para: nextStage,
    actorId: body.actorId,
    // Só o caminho que termina em Concluído fecha o status da solicitação.
    dadosExtras: nextStage === "CONCLUIDO" ? { status: "CONCLUIDO" } : undefined,
  });
  if (!avanco.ok) {
    return NextResponse.json({ error: avanco.erro }, { status: avanco.status });
  }

  // O rótulo da etapa vem de STAGES em workflow.ts. Antes esta rota mantinha um
  // mapa próprio com as três etapas de destino, que era mais um lugar para
  // divergir quando um rótulo mudasse.
  await notificarAvancoDeEtapa(avanco.solicitacao, nextStage);

  return NextResponse.json(avanco.solicitacao);
}
