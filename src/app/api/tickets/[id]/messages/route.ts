import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { TICKET_CATEGORIES } from "@/lib/tickets";
import { resolveChamadoViewer } from "@/lib/chamados-viewer";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";
import { avisar } from "@/lib/avisar";

// POST /api/tickets/[id]/messages: adiciona uma mensagem ao histórico do chamado
// (usado tanto pelo solicitante quanto pelo atendente, cada um digita o próprio nome).
// Só quem gerencia (canViewBoard) ou o próprio solicitante (e-mail bate com
// o do chamado) pode escrever, mesmo critério da tela de detalhe, que já
// bloqueia abrir o chamado de outra pessoa (ver chamados-viewer.ts).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ticket = await prisma.simpleTicket.findUnique({ where: { id: params.id } });
  if (!ticket) return NextResponse.json({ error: "Chamado não encontrado" }, { status: 404 });

  const viewer = await resolveChamadoViewer(req.nextUrl.searchParams.get("userId") ?? undefined);
  if (!viewer.showFullBoard && ticket.requesterEmail !== viewer.email) {
    return NextResponse.json({ error: "Você não tem acesso a este chamado." }, { status: 403 });
  }

  const body = await req.json();
  const { authorName, body: messageBody } = body;
  if (!authorName || !messageBody) {
    return NextResponse.json({ error: "Escreva a mensagem antes de enviar." }, { status: 400 });
  }

  const message = await prisma.ticketMessage.create({
    data: { ticketId: ticket.id, authorName, body: messageBody },
  });

  // Avisa o solicitante por e-mail de que há novidade no chamado, mesmo que
  // quem tenha acabado de escrever seja ele próprio (simples e previsível;
  // não há como distinguir "atendente" de "solicitante" neste modelo).
  const categorySlug = Object.entries(TICKET_CATEGORIES).find(([, c]) => c.enumValue === ticket.category)?.[0];
  if (categorySlug) {
    const config = TICKET_CATEGORIES[categorySlug as keyof typeof TICKET_CATEGORIES];
    const link = `${process.env.APP_URL}/chamados/${categorySlug}/${ticket.id}`;
    const { subject, html } = templates.chamadoNovaMensagem(ticket.requesterName, config.label, ticket.code, link);
    await avisar({
      para: ticket.requesterEmail,
      assunto: subject,
      html,
      slack:
        `*Nova mensagem no chamado *

` +
        `<|Ver e responder>`,
      origem: "chamado nova mensagem",
    });
  }

  return NextResponse.json(message, { status: 201 });
}
