import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireErpAuth } from "@/lib/erpAuth";
import { STAGES } from "@/lib/workflow";

/**
 * POST /api/erp/purchase-requests/[id]/confirm
 *
 * Callback do futuro ERP confirmando que os dados desta solicitação
 * CONCLUIDA foram importados/lançados do lado dele. Body esperado:
 * { erpExternalId: string, note?: string }
 *
 * Idempotente: pode ser chamado de novo (ex: reprocessamento do ERP);
 * apenas atualiza erpExternalId/erpSyncedAt e registra mais uma entrada de
 * auditoria, não há efeito colateral no fluxo de compras em si.
 *
 * Autenticação: header Authorization: Bearer <ERP_API_KEY>.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = requireErpAuth(req);
  if (authError) return authError;

  const request = await prisma.purchaseRequest.findUnique({ where: { id: params.id } });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "CONCLUIDO") {
    return NextResponse.json(
      { error: `Solicitação ainda não foi concluída, está em ${STAGES[request.currentStage].label}.` },
      { status: 409 }
    );
  }

  const body = await req.json();
  const { erpExternalId, note } = body;
  if (!erpExternalId) {
    return NextResponse.json({ error: "Informe o identificador da solicitação no ERP." }, { status: 400 });
  }

  const updated = await prisma.purchaseRequest.update({
    where: { id: request.id },
    data: { erpSyncedAt: new Date(), erpExternalId },
  });

  // Registro de auditoria: mesmo padrão de Comment usado no restante do fluxo.
  await prisma.comment.create({
    data: {
      requestId: request.id,
      authorId: request.requesterId,
      stage: "CONCLUIDO",
      body: `Confirmado pelo ERP, id externo: ${erpExternalId}.${note ? ` Nota: ${note}` : ""}`,
    },
  });
  await prisma.notification.create({
    data: {
      requestId: request.id,
      channel: "ERP",
      recipient: "erp-integration",
      subject: `Confirmação de importação: ${request.code}`,
      status: "ENVIADO",
    },
  });

  return NextResponse.json({ status: "CONFIRMADO", erpSyncedAt: updated.erpSyncedAt, erpExternalId: updated.erpExternalId });
}
