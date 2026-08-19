import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { nextAfterAprovacaoGestor } from "@/lib/workflow";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";
import { requireRole } from "@/lib/rbac";
import { logger } from "@/lib/logger";

/**
 * PATCH /api/requests/[id]/aprovacao-gestor
 *
 * Decisão do gestor do centro de custo (CostCenter.managers, ver
 * /admin/centros-de-custo) logo após o envio do formulário. Pedido do
 * usuário: aprovação automática direcionada ao(s) gestor(es) de cada centro
 * de custo, antes de qualquer ação do comprador. Se aprovado, segue
 * normalmente para Homologação e Triagem; se reprovado, cancela.
 *
 * Autorização: quando o centro de custo tem gestor(es) configurado(s),
 * qualquer um deles pode decidir (mais de um é permitido, pedido do usuário,
 * o que reduz a necessidade de reajuste manual quando o titular está ausente).
 * Sem gestor configurado, cai no fallback antigo (qualquer APROVADOR).
 * `personifiedBy`: um ADMIN pode decidir em nome do gestor pré-definido "a
 * qualquer momento, sempre que julgar necessário" (pedido do usuário), sem
 * o teto de alçada que existe para a personificação do comprador em
 * .../aprovacao.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { actorId, decision, justification, personifiedBy } = body;

  if (!["APROVADO", "REPROVADO"].includes(decision)) {
    return NextResponse.json({ error: "decision inválida (esperado APROVADO ou REPROVADO)" }, { status: 400 });
  }

  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: { requester: true, costCenter: { include: { managers: true } } },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "APROVACAO_GESTOR") {
    return NextResponse.json({ error: "Solicitação não está na etapa de Aprovação do Gestor" }, { status: 409 });
  }

  if (personifiedBy) {
    const roleError = await requireRole(personifiedBy, ["ADMIN"]);
    if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });
    if (!actorId) return NextResponse.json({ error: "actorId obrigatório ao personificar (a quem a decisão é atribuída)." }, { status: 400 });
  } else {
    const pool = request.costCenter.managers;
    if (pool.length > 0) {
      if (!pool.some((m) => m.id === actorId)) {
        return NextResponse.json({ error: "Este usuário não é um dos gestores aprovadores deste centro de custo." }, { status: 403 });
      }
    } else {
      const roleError = await requireRole(actorId, ["APROVADOR"]);
      if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });
    }
  }

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
      managerApprovalPersonifiedBy: personifiedBy ?? null,
      ...(approved ? {} : { status: "CANCELADO", cancelReason: justification }),
    },
  });
  await prisma.stageEvent.create({
    data: { requestId: request.id, fromStage: "APROVACAO_GESTOR", toStage: nextStage, actorId, comment: justification || null },
  });

  if (!approved) {
    const { subject, html } = templates.reprovado(request.requester.name, request.shortDescription, justification);
    await sendPurchaseEmail({ to: request.requester.email, subject, html, requestId: request.id }).catch((erro) => {
      logger.warn("email_reprovacao_gestor_falhou", { solicitacao: request.code, erro });
    });
  }

  return NextResponse.json(updated);
}
