import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { TICKET_CATEGORIES } from "@/lib/tickets";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";

// POST /api/tickets/[id]/messages — adiciona uma mensagem ao histórico do chamado
// (usado tanto pelo solicitante quanto pelo atendente — cada um digita o próprio nome).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ticket = await prisma.simpleTicket.findUnique({ where: { id: params.id } });
  if (!ticket) return NextResponse.json({ error: "Chamado não encontrado" }, { status: 404 });

  const body = await req.json();
  const { authorName, body: messageBody } = body;
  if (!authorName || !messageBody) {
    return NextResponse.json({ error: "Campos obrigatórios: authorName, body." }, { status: 400 });
  }

  const message = await prisma.ticketMessage.create({
    data: { ticketId: ticket.id, authorName, body: messageBody },
  });

  // Avisa o solicitante por e-mail de que há novidade no chamado — mesmo que
  // quem tenha acabado de escrever seja ele próprio (simples e previsível;
  // não há como distinguir "atendente" de "solicitante" neste modelo).
  const categorySlug = Object.entries(TICKET_CATEGORIES).find(([, c]) => c.enumValue === ticket.category)?.[0];
  if (categorySlug) {
    const config = TICKET_CATEGORIES[categorySlug as keyof typeof TICKET_CATEGORIES];
    const link = `${process.env.APP_URL}/chamados/${categorySlug}/${ticket.id}`;
    const { subject, html } = templates.chamadoNovaMensagem(ticket.requesterName, config.label, ticket.code, link);
    await sendPurchaseEmail({ to: ticket.requesterEmail, subject, html });
  }

  return NextResponse.json(message, { status: 201 });
}
