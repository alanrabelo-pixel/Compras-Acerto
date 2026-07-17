import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";

/**
 * PATCH /api/requests/[id]/fiscal
 *
 * Validação fiscal do documento (nota fiscal). Avança para Tesouraria
 * quando approved = true.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: { requester: true },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "FISCAL") {
    return NextResponse.json({ error: "Solicitação não está na etapa de Validação Fiscal" }, { status: 409 });
  }

  const body = await req.json();
  const { actorId, documentUrl, approved, reviewComment } = body;

  const roleError = await requireRole(actorId, ["FISCAL"]);
  if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

  if (!documentUrl) return NextResponse.json({ error: "Campo obrigatório ausente: documentUrl" }, { status: 400 });

  await prisma.fiscalDocument.upsert({
    where: { requestId: request.id },
    update: { documentUrl, approved, reviewComment, decidedAt: new Date() },
    create: { requestId: request.id, documentUrl, approved, reviewComment, decidedAt: new Date() },
  });

  if (!approved) {
    return NextResponse.json({ status: "DOCUMENTO_REPROVADO" });
  }

  const updated = await prisma.purchaseRequest.update({ where: { id: request.id }, data: { currentStage: "TESOURARIA" } });
  await prisma.stageEvent.create({
    data: { requestId: request.id, fromStage: "FISCAL", toStage: "TESOURARIA", actorId },
  });

  const { subject, html } = templates.atualizacaoEtapa(request.requester.name, request.shortDescription, "Tesouraria (Pagamento)");
  await sendPurchaseEmail({ to: request.requester.email, subject, html, requestId: request.id });

  return NextResponse.json(updated);
}
