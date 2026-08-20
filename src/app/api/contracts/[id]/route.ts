import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { sendPurchaseEmail } from "@/lib/integrations/gmail";
import { sendSlackDM } from "@/lib/integrations/slack";
import { logger } from "@/lib/logger";
import { USUARIO_PUBLICO } from "@/lib/usuario";
import { exigirLeituraDeContrato } from "@/lib/acesso";

/**
 * PATCH /api/contracts/[id]
 *
 * Ações de gestão de contrato. A ação CANCELAR só é aceita quando
 * treasuryNotified=true é enviado explicitamente: trava estrutural para o
 * risco identificado na revisão v1.1 (cancelamento sem avisar Tesouraria,
 * que continuaria pagando o contrato). Ao cancelar, notifica de fato a
 * Tesouraria, não só registra o campo.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const contract = await prisma.contract.findUnique({ where: { id: params.id } });
  if (!contract) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });

  const body = await req.json();
  const { actorId, action, treasuryNotified, reason } = body;

  const roleError = await requireRole(actorId, ["COMPRADOR", "JURIDICO"]);
  if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

  if (action === "CANCELAR") {
    if (!treasuryNotified) {
      return NextResponse.json(
        { error: "Antes de cancelar, confirme que a Tesouraria foi avisada: o contrato pode ter pagamentos recorrentes em andamento." },
        { status: 422 }
      );
    }

    const treasuryUsers = await prisma.user.findMany({ where: { roles: { some: { role: "TESOURARIA" } } } });
    for (const user of treasuryUsers) {
      await sendPurchaseEmail({
        to: user.email,
        subject: `Contrato cancelado: ${contract.supplierName}`,
        html: `<p>O contrato com <b>${contract.supplierName}</b> (área ${contract.area}) foi cancelado. Motivo: ${reason ?? "não informado"}. Suspenda pagamentos recorrentes associados.</p>`,
      });
      await sendSlackDM({
        slackUserEmail: user.email,
        text: `Contrato com ${contract.supplierName} foi cancelado. Suspenda pagamentos recorrentes associados.`,
      }).catch((erro) => {
        logger.warn("aviso_cancelamento_contrato_falhou", {
          contratoId: contract.id,
          destino: user.email,
          erro,
        });
      });
    }

    const updated = await prisma.contract.update({
      where: { id: contract.id },
      data: { status: "CANCELADO", treasuryNotifiedOnCancel: true },
    });
    return NextResponse.json(updated);
  }

  if (action === "RENOVACAO_EM_ANDAMENTO") {
    const updated = await prisma.contract.update({ where: { id: contract.id }, data: { status: "RENOVACAO_EM_ANDAMENTO" } });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Ação desconhecida. Use CANCELAR ou RENOVACAO_EM_ANDAMENTO." }, { status: 400 });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  // Quadro ou o gestor daquele contrato. Antes de qualquer consulta.
  const barrado = await exigirLeituraDeContrato(params.id);
  if (barrado) return barrado;

  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    include: { contractManager: { select: USUARIO_PUBLICO }, alerts: true, request: true },
  });
  if (!contract) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  return NextResponse.json(contract);
}
