import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ehProducao } from "@/lib/ambiente";
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
 * A CADÊNCIA SEMANAL É DECIDIDA AQUI, não no agendador. Antes desta correção a
 * rota enviava em toda chamada, sem olhar o histórico: duas execuções no mesmo
 * dia geravam dois avisos idênticos para o mesmo gestor, e uma semana sem
 * execução simplesmente não avisava ninguém. Quem definia a cadência era a
 * configuração do job externo, que nem sequer é versionada neste repositório.
 *
 * O critério agora é o último ContractAlert registrado para o contrato (o
 * histórico de envios que já existia; nenhum campo novo no banco): só sai aviso
 * se o último tiver saído há mais de uma semana. Contrato sem nenhum alerta
 * registrado entra sempre. É uma JANELA, não uma data exata nem dia da semana,
 * então não existe execução que "perca o dia certo" e deixe de avisar.
 *
 * Chamar DIARIAMENTE pelo agendador (Railway Cron / Vercel Cron) com o header
 * de autenticação CRON_SECRET; não expor publicamente. Rodando todo dia, um dia
 * perdido é recuperado no dia seguinte e mesmo assim ninguém recebe dois avisos
 * na mesma semana.
 */

/** Um aviso por contrato por semana, que é o que o manual promete. */
const CADENCIA_ALERTA_DIAS = 7;
/**
 * Folga sobre a cadência. O agendador não dispara no mesmo instante toda vez:
 * sem esta tolerância, uma execução semanal que rodasse alguns minutos mais
 * cedo veria "6d23h58 < 7d", pularia a semana e a cadência viraria quinzenal.
 */
const TOLERANCIA_HORAS = 12;

export async function GET(req: NextRequest) {
  const credencial = verificarTokenDeMaquina(req.headers.get("authorization"), "CRON_SECRET");
  if (!credencial.ok) {
    return NextResponse.json({ error: credencial.erro }, { status: credencial.status });
  }

  const agora = new Date();
  const threeMonthsFromNow = new Date(agora);
  threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);

  const inicioDaSemanaCorrente = new Date(
    agora.getTime() - (CADENCIA_ALERTA_DIAS * 24 - TOLERANCIA_HORAS) * 3_600_000
  );

  const janelaDeRenovacao = { status: "ATIVO", renewalDate: { lte: threeMonthsFromNow } };

  const contracts = await prisma.contract.findMany({
    where: {
      ...janelaDeRenovacao,
      // Guarda de repetição sem campo novo no banco: o próprio histórico de
      // envios diz se este contrato já foi avisado dentro da semana.
      alerts: { none: { sentAt: { gte: inicioDaSemanaCorrente } } },
    },
    include: { contractManager: { select: USUARIO_PUBLICO } },
  });

  const contratosAVencer = await prisma.contract.count({ where: janelaDeRenovacao });
  logger.info("cron_alerta_contrato_iniciado", {
    contratosAVencer,
    aAvisarNestaSemana: contracts.length,
    jaAvisadosNaSemana: contratosAVencer - contracts.length,
  });

  let sent = 0;
  let falhasDeAviso = 0;
  // Contados à parte: fora de produção o aviso é simulado, nada é gravado.
  let simulados = 0;
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
    //
    // Fora de produção NÃO grava. A trava de envio bloqueia a mensagem sem
    // lançar, de propósito, então o .catch acima nunca roda e este registro
    // sairia afirmando que o gestor foi avisado quando nada saiu. Isso é o
    // mesmo defeito que o alerta de fracionamento já teve e que foi corrigido
    // em 19/08, reintroduzido por outro caminho. E aqui é pior: o filtro
    // semântico lá em cima ignora contratos que já têm alerta na semana, então
    // a linha falsa do Sandbox SUPRIME o alerta verdadeiro da Produção quando
    // os dois compartilham banco.
    if (ehProducao()) {
      await prisma.contractAlert.create({
        data: { contractId: contract.id, channel: slackEnviado ? "EMAIL_E_SLACK" : "EMAIL" },
      });
      sent++;
    } else {
      simulados++;
    }
  }

  logger.info("cron_alerta_contrato_concluido", { alertados: sent, simulados, falhasDeAviso });
  return NextResponse.json({
    contractsAlerted: sent,
    simulados,
    falhasDeAviso,
    jaAvisadosNaSemana: contratosAVencer - contracts.length,
  });
}
