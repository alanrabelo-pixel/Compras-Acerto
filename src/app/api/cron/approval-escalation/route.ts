import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ehProducao } from "@/lib/ambiente";
import { sendSlackDM } from "@/lib/integrations/slack";
import { verificarTokenDeMaquina } from "@/lib/segredos";
import { APPROVAL_ESCALATION_BUSINESS_DAYS } from "@/lib/workflow";
import { logger } from "@/lib/logger";
import { DESTINO_CONTROLADORIA } from "@/lib/destinatarios";
import { USUARIO_PUBLICO } from "@/lib/usuario";

/**
 * Escalonamento por SLA (revisão v1.1). Roda diariamente: para toda Approval
 * pendente cujo dueAt já passou e que ainda não foi escalonada, notifica o
 * aprovador (lembrete) e a Controladoria (visibilidade), sem decidir sozinho.
 *
 * Configurar como job agendado (Railway Cron / Vercel Cron) chamando esta rota
 * com o mesmo CRON_SECRET usado no alerta de contratos.
 */
export async function GET(req: NextRequest) {
  const credencial = verificarTokenDeMaquina(req.headers.get("authorization"), "CRON_SECRET");
  if (!credencial.ok) {
    return NextResponse.json({ error: credencial.erro }, { status: credencial.status });
  }

  const overdue = await prisma.approval.findMany({
    where: { decision: "PENDENTE", dueAt: { lte: new Date() }, escalatedAt: null },
    include: { approver: { select: USUARIO_PUBLICO }, request: true },
  });

  logger.info("cron_escalonamento_iniciado", { aprovacoesEmAtraso: overdue.length });

  let escalated = 0;
  let falhasDeAviso = 0;
  let simulados = 0;
  for (const approval of overdue) {
    // O aviso é best-effort de propósito: se o Slack estiver fora, o
    // escalonamento ainda precisa ser marcado. Mas a falha agora fica
    // registrada, em vez de sumir num catch vazio, senão ninguém descobre
    // que o lembrete parou de chegar.
    await sendSlackDM({
      slackUserEmail: approval.approver.email,
      text: `Lembrete: a solicitação ${approval.request.code} está aguardando sua aprovação há mais de ${APPROVAL_ESCALATION_BUSINESS_DAYS} dias úteis.`,
    }).catch((erro) => {
      falhasDeAviso++;
      logger.warn("cron_escalonamento_slack_falhou", { destino: "aprovador", solicitacao: approval.request.code, erro });
    });

    await sendSlackDM({
      slackUserEmail: DESTINO_CONTROLADORIA,
      text: `Aprovação em atraso: ${approval.request.code}, aprovador ${approval.approver.name}, aberta desde ${approval.request.createdAt.toLocaleDateString("pt-BR")}.`,
    }).catch((erro) => {
      falhasDeAviso++;
      logger.warn("cron_escalonamento_slack_falhou", { destino: "controladoria", solicitacao: approval.request.code, erro });
    });

    // Fora de produção NÃO marca. A trava de envio bloqueia sem lançar, então
    // o .catch acima não roda e este update diria que o aprovador foi
    // lembrado sem nada ter saído. Aqui a supressão é pior que no alerta de
    // contrato: o filtro desta rota é `escalatedAt: null`, então a marcação
    // falsa do Sandbox tira aquela aprovação do escalonamento PARA SEMPRE, não
    // por uma semana. Com banco compartilhado, o aprovador de verdade nunca
    // mais é cobrado por aquele atraso.
    if (ehProducao()) {
      await prisma.approval.update({ where: { id: approval.id }, data: { escalatedAt: new Date() } });
      escalated++;
    } else {
      simulados++;
    }
  }

  logger.info("cron_escalonamento_concluido", { escalonadas: escalated, simulados, falhasDeAviso });
  return NextResponse.json({ escalated, simulados, falhasDeAviso });
}
