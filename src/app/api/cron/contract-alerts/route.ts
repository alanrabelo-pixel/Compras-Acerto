import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";
import { sendSlackDM } from "@/lib/integrations/slack";
import { formatDateOnly } from "@/lib/format";
import { verificarTokenDeMaquina } from "@/lib/segredos";
import { logger } from "@/lib/logger";
import { USUARIO_PUBLICO } from "@/lib/usuario";

/**
 * Alerta de renovação de contrato: seleciona os contratos ativos cuja renovação
 * está prevista para os próximos 3 meses, conforme a seção "Mapeamento do
 * contrato" do documento de referência.
 *
 * A CADÊNCIA é do agendador, não daqui: esta rota não verifica dia da semana.
 * O comentário anterior dizia que disparava toda segunda-feira, o que o código
 * nunca garantiu. Chamar duas vezes no mesmo dia reenvia os mesmos avisos,
 * porque não há guarda de repetição (diferente do cron de escalonamento, que
 * marca escalatedAt).
 *
 * Configurar como job agendado (Railway Cron / Vercel Cron) chamando esta rota
 * com um header de autenticação simples (CRON_SECRET); não expor publicamente.
 */
export async function GET(req: NextRequest) {
  const credencial = verificarTokenDeMaquina(req.headers.get("authorization"), "CRON_SECRET");
  if (!credencial.ok) {
    return NextResponse.json({ error: credencial.erro }, { status: credencial.status });
  }

  const threeMonthsFromNow = new Date();
  threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);

  const contracts = await prisma.contract.findMany({
    where: {
      status: "ATIVO",
      renewalDate: { lte: threeMonthsFromNow },
    },
    include: { contractManager: { select: USUARIO_PUBLICO } },
  });

  logger.info("cron_alerta_contrato_iniciado", { contratosAVencer: contracts.length });

  let sent = 0;
  let falhasDeAviso = 0;
  for (const contract of contracts) {
    const { subject, html } = templates.alertaRenovacaoContrato(
      contract.contractManager.name,
      contract.supplierName,
      formatDateOnly(contract.endDate),
      `${process.env.APP_URL}/solicitacoes/nova?origemContrato=${contract.id}`
    );
    await sendPurchaseEmail({ to: contract.contractManager.email, subject, html });

    let slackEnviado = true;
    await sendSlackDM({
      slackUserEmail: contract.contractManager.email,
      text: `Contrato com ${contract.supplierName} vence em ${formatDateOnly(contract.endDate)}. Abra uma nova Solicitação de Compra para renovar ou cancelar.`,
    }).catch((erro) => {
      slackEnviado = false;
      falhasDeAviso++;
      logger.warn("cron_alerta_contrato_slack_falhou", { contratoId: contract.id, fornecedor: contract.supplierName, erro });
    });

    // O canal registrado era sempre EMAIL, mesmo quando o Slack também saía,
    // então o histórico de alertas não refletia por onde a pessoa foi avisada.
    await prisma.contractAlert.create({
      data: { contractId: contract.id, channel: slackEnviado ? "EMAIL_E_SLACK" : "EMAIL" },
    });
    sent++;
  }

  logger.info("cron_alerta_contrato_concluido", { alertados: sent, falhasDeAviso });
  return NextResponse.json({ contractsAlerted: sent, falhasDeAviso });
}
