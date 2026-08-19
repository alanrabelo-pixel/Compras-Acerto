import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { sendPurchaseEmail } from "@/lib/integrations/gmail";
import { sendSlackDM } from "@/lib/integrations/slack";

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
        { error: "Confirme que a Tesouraria foi notificada (treasuryNotified=true) antes de cancelar, pois o contrato pode ter pagamentos recorrentes em andamento." },
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
      }).catch(() => {});
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
  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    include: { contractManager: true, alerts: true, request: true },
  });
  if (!contract) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  return NextResponse.json(contract);
}
