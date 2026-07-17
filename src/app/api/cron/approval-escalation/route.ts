import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendSlackDM } from "@/lib/integrations/slack";

/**
 * Escalonamento por SLA (revisão v1.1) — roda diariamente. Para toda Approval
 * pendente cujo dueAt já passou e que ainda não foi escalonada, notifica o
 * aprovador (lembrete) e a Controladoria (visibilidade), sem decidir sozinho.
 *
 * Configurar como job agendado (Railway Cron / Vercel Cron) chamando esta rota
 * com o mesmo CRON_SECRET usado no alerta de contratos.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const overdue = await prisma.approval.findMany({
    where: { decision: "PENDENTE", dueAt: { lte: new Date() }, escalatedAt: null },
    include: { approver: true, request: true },
  });

  let escalated = 0;
  for (const approval of overdue) {
    await sendSlackDM({
      slackUserEmail: approval.approver.email,
      text: `Lembrete: a solicitação ${approval.request.code} está aguardando sua aprovação há mais de ${process.env.APPROVAL_ESCALATION_DAYS ?? 3} dias úteis.`,
    }).catch(() => {});

    await sendSlackDM({
      slackUserEmail: "controladoria@acerto.com.br",
      text: `Aprovação em atraso: ${approval.request.code}, aprovador ${approval.approver.name}, aberta desde ${approval.request.createdAt.toLocaleDateString("pt-BR")}.`,
    }).catch(() => {});

    await prisma.approval.update({ where: { id: approval.id }, data: { escalatedAt: new Date() } });
    escalated++;
  }

  return NextResponse.json({ escalated });
}
