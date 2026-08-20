import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { avancarEtapa, notificarAvancoDeEtapa } from "@/lib/etapa";
import { USUARIO_PUBLICO } from "@/lib/usuario";

/**
 * PATCH /api/requests/[id]/medicao
 *
 * Medição do escopo executado + aprovação financeira. Só avança para Fiscal
 * quando technicalApproval = APROVADO; se REPROVADO, permanece na etapa
 * para nova medição/ajuste (não cancela a solicitação automaticamente).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: { requester: { select: USUARIO_PUBLICO } },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "MEDICAO") {
    return NextResponse.json({ error: "Solicitação não está na etapa de Medição" }, { status: 409 });
  }

  const body = await req.json();
  const { actorId, scopeExecuted, quantities, contractRef, technicalApproval, reviewComment } = body;

  const roleError = await requireRole(actorId, ["COMPRADOR"]);
  if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

  if (!scopeExecuted) {
    return NextResponse.json({ error: "Descreva o escopo executado para registrar a medição." }, { status: 400 });
  }

  await prisma.measurement.upsert({
    where: { requestId: request.id },
    update: { scopeExecuted, quantities, contractRef, technicalApproval, reviewComment, decidedAt: new Date() },
    create: { requestId: request.id, scopeExecuted, quantities, contractRef, technicalApproval, reviewComment, decidedAt: new Date() },
  });

  if (technicalApproval !== "APROVADO") {
    return NextResponse.json({ status: "MEDICAO_REGISTRADA", technicalApproval });
  }

  const avanco = await avancarEtapa({
    requestId: request.id,
    de: "MEDICAO",
    para: "FISCAL",
    actorId,
  });
  if (!avanco.ok) {
    return NextResponse.json({ error: avanco.erro }, { status: avanco.status });
  }

  await notificarAvancoDeEtapa(avanco.solicitacao, "FISCAL");

  return NextResponse.json(avanco.solicitacao);
}
