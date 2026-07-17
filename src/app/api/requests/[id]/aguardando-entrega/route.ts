import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { nextAfterAguardandoEntrega } from "@/lib/workflow";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";

const STAGE_LABEL: Record<string, string> = {
  MEDICAO: "Medição e Aprovação Financeira",
  MAPEAMENTO_CONTRATO: "Mapeamento de Contrato",
  CONCLUIDO: "Concluído",
};

/**
 * PATCH /api/requests/[id]/aguardando-entrega
 *
 * Confirma o recebimento/entrega e decide a próxima etapa: Medição (se
 * needsMeasurement), Mapeamento de Contrato (se needsMapping) ou Concluído.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: { requester: true, purchaseOrder: true },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "AGUARDANDO_ENTREGA") {
    return NextResponse.json({ error: "Solicitação não está na etapa de Aguardando Entrega/Conclusão" }, { status: 409 });
  }

  const body = await req.json();
  const roleError = await requireRole(body.actorId, ["COMPRADOR"]);
  if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

  const needsMeasurement = body.needsMeasurement ?? request.purchaseOrder?.needsMeasurement ?? false;
  const needsMapping = body.needsMapping ?? request.needsMapping ?? false;

  const nextStage = nextAfterAguardandoEntrega({ needsMeasurement, needsMapping });

  const updated = await prisma.purchaseRequest.update({
    where: { id: request.id },
    data: { currentStage: nextStage, ...(nextStage === "CONCLUIDO" ? { status: "CONCLUIDO" } : {}) },
  });
  await prisma.stageEvent.create({
    data: { requestId: request.id, fromStage: "AGUARDANDO_ENTREGA", toStage: nextStage, actorId: body.actorId },
  });

  const { subject, html } = templates.atualizacaoEtapa(request.requester.name, request.shortDescription, STAGE_LABEL[nextStage]);
  await sendPurchaseEmail({ to: request.requester.email, subject, html, requestId: request.id });

  return NextResponse.json(updated);
}
