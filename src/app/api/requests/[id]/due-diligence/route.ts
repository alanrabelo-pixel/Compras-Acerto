import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";
import { avisar } from "@/lib/avisar";
import { avancarEtapa, notificarAvancoDeEtapa } from "@/lib/etapa";
import { USUARIO_PUBLICO } from "@/lib/usuario";

/**
 * PATCH /api/requests/[id]/due-diligence
 *
 * Due Diligence de Privacidade/Segurança: obrigatório para Ferramenta Nova
 * (ou quando handlesPersonalData foi marcado na Triagem). Decisão exclusiva
 * do papel PRIVACIDADE. Se aprovado -> Cotação; se reprovado -> Cancelado.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { decidedBy, approved, justification } = body;

  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: { requester: { select: USUARIO_PUBLICO } },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "DUE_DILIGENCE") {
    return NextResponse.json({ error: "Solicitação não está na etapa de Due Diligence" }, { status: 409 });
  }

  const roleError = await requireRole(decidedBy, ["PRIVACIDADE"]);
  if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

  await prisma.dueDiligenceReview.upsert({
    where: { requestId: request.id },
    update: { approved, justification, decidedAt: new Date() },
    create: { requestId: request.id, approved, justification, decidedAt: new Date() },
  });

  const nextStage = approved ? "COTACAO" : "CANCELADO";

  const avanco = await avancarEtapa({
    requestId: request.id,
    de: "DUE_DILIGENCE",
    para: nextStage,
    actorId: decidedBy,
    comentario: justification,
    dadosExtras: approved ? undefined : { status: "CANCELADO", cancelReason: justification ?? "Reprovado em Due Diligence" },
  });
  if (!avanco.ok) {
    return NextResponse.json({ error: avanco.erro }, { status: avanco.status });
  }

  if (approved) {
    await notificarAvancoDeEtapa(avanco.solicitacao, nextStage);
  } else {
    // Reprovado encerra a solicitação, então usa o template de reprovação e
    // não o de avanço de etapa.
    const link = `${process.env.APP_URL}/solicitacoes/${request.id}`;
    const motivo = justification ?? "reprovado em Due Diligence";
    const { subject, html } = templates.reprovado(
      request.requester.name,
      request.code,
      request.shortDescription,
      "Due Diligence (Privacidade)",
      motivo,
      link,
    );
    await avisar({
      para: request.requester.email,
      assunto: subject,
      html,
      slack:
        `*${request.code} foi reprovada no Due Diligence*\n${request.shortDescription}\n` +
        `Motivo: ${motivo}\n<${link}|Ver a solicitação>`,
      requestId: request.id,
      origem: "due diligence reprovado",
    });
  }

  return NextResponse.json(avanco.solicitacao);
}
