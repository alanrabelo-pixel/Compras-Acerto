import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";
import { sendSlackDM } from "@/lib/integrations/slack";
import { formatDateOnly } from "@/lib/format";

/**
 * Alerta semanal de renovação de contrato: dispara toda segunda-feira, 3 meses
 * antes da data de renovação prevista, conforme seção "Mapeamento do contrato"
 * do documento de referência.
 *
 * Configurar como job agendado (Railway Cron / Vercel Cron) chamando esta rota
 * com um header de autenticação simples (CRON_SECRET); não expor publicamente.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const threeMonthsFromNow = new Date();
  threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);

  const contracts = await prisma.contract.findMany({
    where: {
      status: "ATIVO",
      renewalDate: { lte: threeMonthsFromNow },
    },
    include: { contractManager: true },
  });

  let sent = 0;
  for (const contract of contracts) {
    const { subject, html } = templates.alertaRenovacaoContrato(
      contract.contractManager.name,
      contract.supplierName,
      formatDateOnly(contract.endDate),
      `${process.env.APP_URL}/solicitacoes/nova?origemContrato=${contract.id}`
    );
    await sendPurchaseEmail({ to: contract.contractManager.email, subject, html });
    await sendSlackDM({
      slackUserEmail: contract.contractManager.email,
      text: `Contrato com ${contract.supplierName} vence em ${formatDateOnly(contract.endDate)}. Abra uma nova Solicitação de Compra para renovar ou cancelar.`,
    }).catch(() => {});

    await prisma.contractAlert.create({
      data: { contractId: contract.id, channel: "EMAIL" },
    });
    sent++;
  }

  return NextResponse.json({ contractsAlerted: sent });
}
