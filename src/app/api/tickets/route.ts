import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { TICKET_CATEGORIES, isTicketCategorySlug } from "@/lib/tickets";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";
import { proximoCodigo } from "@/lib/codigo";

// GET /api/tickets?category=viagens|facilities: lista chamados de uma categoria.
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

// POST /api/tickets: cria um novo chamado (nome, e-mail, descrição livre).
// supplierName/supplierContact* e requestKind/contract* são exclusivos do
// fluxo de Jurídico (ver NdaRequestForm.tsx) e opcionais, ficam undefined
// para Viagens/Facilities. requestKind distingue "NDA" de "CONTRATO" dentro
// dessa mesma categoria.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    category: categorySlug, requesterName, requesterEmail, description, requestKind,
    supplierName, supplierContactName, supplierContactRole, supplierContactEmail, supplierContactPhone,
    contractId, contractSupplierName, contractObject,
  } = body;

  if (!isTicketCategorySlug(categorySlug)) {
    return NextResponse.json({ error: "Categoria inválida." }, { status: 400 });
  }
  if (!requesterName || !requesterEmail || !description) {
    return NextResponse.json({ error: "Preencha seu nome, seu e-mail e a descrição do que precisa." }, { status: 400 });
  }

  const config = TICKET_CATEGORIES[categorySlug];
  const code = await proximoCodigo(config.prefix);

  const ticket = await prisma.simpleTicket.create({
    data: {
      code, category: config.enumValue, requesterName, requesterEmail, description,
      requestKind: requestKind || undefined,
      supplierName: supplierName || undefined,
      supplierContactName: supplierContactName || undefined,
      supplierContactRole: supplierContactRole || undefined,
      supplierContactEmail: supplierContactEmail || undefined,
      supplierContactPhone: supplierContactPhone || undefined,
      contractId: contractId || undefined,
      contractSupplierName: contractSupplierName || undefined,
      contractObject: contractObject || undefined,
    },
  });

  const link = `${process.env.APP_URL}/chamados/${categorySlug}/${ticket.id}`;
  const { subject, html } = templates.chamadoAberto(requesterName, config.label, code, link);
  await sendPurchaseEmail({ to: requesterEmail, subject, html });

  return NextResponse.json(ticket, { status: 201 });
}
