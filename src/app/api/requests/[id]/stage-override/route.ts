import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { Stage } from "@prisma/client";

/**
 * PATCH /api/requests/[id]/stage-override
 *
 * Ajuste administrativo de etapa: move a solicitação para qualquer outra
 * etapa (não só a etapa anterior registrada ou os destinos "válidos" do
 * grafo de workflow.ts) — decisão do usuário: o admin quis a lista completa
 * de etapas disponível tanto para retroceder quanto para avançar, não só as
 * transições estruturalmente esperadas. Não re-executa nenhuma
 * validação/efeito da etapa (ex: não recalcula alçada, não reenvia e-mail).
 * Fica registrado no Histórico como uma transição normal (mesma tabela
 * StageEvent), com actorId e comentário identificando que foi manual, então
 * o rastro de auditoria continua completo. Restrito a ADMIN — bypassa as
 * regras de negócio de cada etapa, então não pode ficar disponível para
 * qualquer papel.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { actorId, direction, targetStage } = body as { actorId?: string; direction?: "back" | "forward"; targetStage?: string };

  const roleError = await requireRole(actorId, ["ADMIN"]);
  if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

  if (!targetStage || !(targetStage in Stage)) {
    return NextResponse.json({ error: "Informe uma etapa de destino válida." }, { status: 400 });
  }

  const request = await prisma.purchaseRequest.findUnique({ where: { id: params.id } });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });

  const newStage = targetStage as Stage;
  if (newStage === request.currentStage) {
    return NextResponse.json({ error: "A solicitação já está nesta etapa." }, { status: 409 });
  }

  const status = newStage === "CONCLUIDO" ? "CONCLUIDO" : newStage === "CANCELADO" ? "CANCELADO" : "ABERTO";

  const updated = await prisma.purchaseRequest.update({
    where: { id: request.id },
    data: { currentStage: newStage, status },
  });

  await prisma.stageEvent.create({
    data: {
      requestId: request.id,
      fromStage: request.currentStage,
      toStage: newStage,
      actorId,
      comment: direction === "back" ? "Etapa retrocedida manualmente por um administrador." : "Etapa avançada manualmente por um administrador (sem validações da etapa).",
    },
  });

  return NextResponse.json(updated);
}
