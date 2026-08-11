import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { nextAfterAprovacaoGestor } from "@/lib/workflow";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";
import { requireRole } from "@/lib/rbac";

/**
 * PATCH /api/requests/[id]/aprovacao-gestor
 *
 * Decisão do gestor do centro de custo (CostCenter.managerId, ver
 * /admin/centros-de-custo) logo após o envio do formulário — pedido do
 * usuário: aprovação automática direcionada ao gestor de cada centro de
 * custo, antes de qualquer ação do comprador. Se aprovado, segue
 * normalmente para Homologação e Triagem; se reprovado, cancela.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { actorId, decision, justification } = body;

  if (!["APROVADO", "REPROVADO"].includes(decision)) {
    return NextResponse.json({ error: "decision inválida (esperado APROVADO ou REPROVADO)" }, { status: 400 });
  }

  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: { requester: true },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "APROVACAO_GESTOR") {
    return NextResponse.json({ error: "Solicitação não está na etapa de Aprovação do Gestor" }, { status: 409 });
  }

  const roleError = await requireRole(actorId, ["APROVADOR"]);
  if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

  if (decision === "REPROVADO" && !justification) {
    return NextResponse.json({ error: "Justificativa é obrigatória para reprovar." }, { status: 422 });
  }

  const approved = decision === "APROVADO";
  const nextStage = nextAfterAprovacaoGestor({ approved });

  const updated = await prisma.purchaseRequest.update({
    where: { id: request.id },
    data: {
      currentStage: nextStage,
      managerApprovalDecision: decision,
      managerApprovalActorId: actorId,
      managerApprovalJustification: justification ?? null,
      managerApprovalDecidedAt: new Date(),
      ...(approved ? {} : { status: "CANCELADO", cancelReason: justification }),
    },
  });
  await prisma.stageEvent.create({
    data: { requestId: request.id, fromStage: "APROVACAO_GESTOR", toStage: nextStage, actorId, comment: justification || null },
  });

  if (!approved) {
    const { subject, html } = templates.reprovado(request.requester.name, request.shortDescription, justification);
    await sendPurchaseEmail({ to: request.requester.email, subject, html, requestId: request.id }).catch(() => {});
  }

  return NextResponse.json(updated);
}
