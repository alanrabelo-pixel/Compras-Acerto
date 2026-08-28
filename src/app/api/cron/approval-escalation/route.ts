import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ehProducao } from "@/lib/ambiente";
import { avisar } from "@/lib/avisar";
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
    // Pelos dois canais desde 21/08/2026. Eram só Slack, e o lembrete de
    // atraso é justamente a mensagem que não pode depender de a pessoa estar
    // olhando o Slack naquele dia. O aviso continua best-effort: se um canal
    // falhar, o escalonamento ainda é marcado, e a falha fica registrada em
    // vez de sumir (o `avisar` loga por canal).
    const link = `${process.env.APP_URL}/solicitacoes/${approval.request.id}`;
    const dias = APPROVAL_ESCALATION_BUSINESS_DAYS;

    // Item 2.10 do diagnóstico de IA: antes o lembrete só dizia "está
    // atrasada", sem contexto de quanto está em jogo. Não é IA generativa
    // (não há nada a "gerar" aqui) — é o mesmo dado que a solicitação já
    // carrega (valor, faixa de risco, prazo geral da SLA), só que agora
    // também aparece na mensagem que já sai automaticamente todo dia.
    const valor =
      approval.request.estimatedValue !== null
        ? `R$ ${Number(approval.request.estimatedValue).toLocaleString("pt-BR")}`
        : "não informado";
    const faixa = approval.request.lane ?? "não definida";
    const contexto = `Valor: ${valor} · Faixa de risco: ${faixa}`;

    let alertaSla: string | null = null;
    if (approval.request.slaDeadline) {
      const diasParaSla = Math.ceil((approval.request.slaDeadline.getTime() - Date.now()) / 86_400_000);
      if (diasParaSla < 0) alertaSla = `O prazo geral da SLA da solicitação também já venceu, há ${Math.abs(diasParaSla)} dia(s).`;
      else if (diasParaSla <= 3) alertaSla = `O prazo geral da SLA da solicitação também está próximo: vence em ${diasParaSla} dia(s).`;
    }

    const aoAprovador = await avisar({
      para: approval.approver.email,
      assunto: `Lembrete: ${approval.request.code} aguarda sua aprovação há mais de ${dias} dias úteis`,
      html:
        `<p>Olá, <b>${approval.approver.name}</b>!</p>` +
        `<p>A solicitação <b>${approval.request.code}</b> está aguardando a sua aprovação há mais de <b>${dias} dias úteis</b>.</p>` +
        `<p>${contexto}</p>` +
        (alertaSla ? `<p><b>${alertaSla}</b></p>` : "") +
        `<p>Enquanto a decisão não sai, a compra fica parada nesta etapa.</p>` +
        `<p><a href="${link}">Abrir a solicitação para decidir</a></p>` +
        `<p>Atenciosamente,<br/>Time de Compras | F&NC</p>`,
      slack:
        `*Lembrete: ${approval.request.code} aguarda sua aprovação*\n` +
        `Há mais de ${dias} dias úteis. ${contexto}\n` +
        (alertaSla ? `${alertaSla}\n` : "") +
        `A compra fica parada até a decisão.\n` +
        `<${link}|Abrir a solicitação para decidir>`,
      requestId: approval.request.id,
      origem: "escalonamento ao aprovador",
    });

    const aControladoria = await avisar({
      para: DESTINO_CONTROLADORIA,
      assunto: `Aprovação em atraso: ${approval.request.code}`,
      html:
        `<p>A aprovação da solicitação <b>${approval.request.code}</b> está em atraso.</p>` +
        `<p>Aprovador: ${approval.approver.name}<br/>Aberta desde: ${approval.request.createdAt.toLocaleDateString("pt-BR")}</p>` +
        `<p>${contexto}</p>` +
        (alertaSla ? `<p><b>${alertaSla}</b></p>` : "") +
        `<p><a href="${link}">Abrir a solicitação</a></p>`,
      slack:
        `*Aprovação em atraso: ${approval.request.code}*\n` +
        `Aprovador: ${approval.approver.name}\n` +
        `Aberta desde ${approval.request.createdAt.toLocaleDateString("pt-BR")}. ${contexto}\n` +
        (alertaSla ? `${alertaSla}\n` : "") +
        `<${link}|Abrir a solicitação>`,
      requestId: approval.request.id,
      origem: "escalonamento a controladoria",
    });

    // Um canal que falha conta como falha de aviso, e os dois avisos contam
    // separado: o contador vai na resposta e no log, e um número que não é
    // medido de verdade é pior que não ter número.
    for (const resultado of [aoAprovador, aControladoria]) {
      if (!resultado.email) falhasDeAviso++;
      if (!resultado.slack) falhasDeAviso++;
    }

    // Fora de produção NÃO marca. A trava de envio bloqueia SEM LANÇAR, então
    // os avisos acima contam como sucesso e este update diria que o aprovador
    // foi lembrado sem nada ter saído. Aqui a supressão é pior que no alerta de
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
