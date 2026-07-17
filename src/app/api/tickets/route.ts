import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { TICKET_CATEGORIES, isTicketCategorySlug } from "@/lib/tickets";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";

// GET /api/tickets?category=viagens|facilities — lista chamados de uma categoria.
export async function GET(req: NextRequest) {
  const categorySlug = req.nextUrl.searchParams.get("category") ?? "";
  if (!isTicketCategorySlug(categorySlug)) {
    return NextResponse.json({ error: "Categoria inválida." }, { status: 400 });
  }

  const tickets = await prisma.simpleTicket.findMany({
    where: { category: TICKET_CATEGORIES[categorySlug].enumValue },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(tickets);
}

// POST /api/tickets — cria um novo chamado (nome, e-mail, descrição livre).
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { category: categorySlug, requesterName, requesterEmail, description } = body;

  if (!isTicketCategorySlug(categorySlug)) {
    return NextResponse.json({ error: "Categoria inválida." }, { status: 400 });
  }
  if (!requesterName || !requesterEmail || !description) {
    return NextResponse.json({ error: "Campos obrigatórios: requesterName, requesterEmail, description." }, { status: 400 });
  }

  const config = TICKET_CATEGORIES[categorySlug];
  const count = await prisma.simpleTicket.count({ where: { category: config.enumValue } });
  const code = `${config.prefix}-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

  const ticket = await prisma.simpleTicket.create({
    data: { code, category: config.enumValue, requesterName, requesterEmail, description },
  });

  const link = `${process.env.APP_URL}/chamados/${categorySlug}/${ticket.id}`;
  const { subject, html } = templates.chamadoAberto(requesterName, config.label, code, link);
  await sendPurchaseEmail({ to: requesterEmail, subject, html });

  return NextResponse.json(ticket, { status: 201 });
}
