import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveChamadoViewer } from "@/lib/chamados-viewer";
import type { TicketStatus } from "@prisma/client";

const VALID_STATUS: TicketStatus[] = ["ABERTO", "EM_ANDAMENTO", "CONCLUIDO"];

// GET /api/tickets/[id] — detalhe de um chamado (com mensagens).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ticket = await prisma.simpleTicket.findUnique({
    where: { id: params.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!ticket) return NextResponse.json({ error: "Chamado não encontrado" }, { status: 404 });
  return NextResponse.json(ticket);
}

// PATCH /api/tickets/[id] — muda o status (Aberto / Em Andamento / Concluído).
// Ação de quem atende o chamado, não de quem abriu — mesmo critério de
// canViewBoard usado no resto do app (ver src/lib/chamados-viewer.ts). A UI
// já esconde o seletor de status pra quem não pode mudar (ChamadoThread),
// mas isso sozinho não impede uma chamada direta à API — daí a checagem
// aqui também.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const viewer = await resolveChamadoViewer(req.nextUrl.searchParams.get("userId") ?? undefined);
  if (!viewer.showFullBoard) {
    return NextResponse.json({ error: "Você não tem permissão para alterar o status deste chamado." }, { status: 403 });
  }

  const body = await req.json();
  const { status } = body;
  if (!VALID_STATUS.includes(status)) {
    return NextResponse.json({ error: `Status inválido. Use um de: ${VALID_STATUS.join(", ")}` }, { status: 400 });
  }

  const ticket = await prisma.simpleTicket.update({ where: { id: params.id }, data: { status } });
  return NextResponse.json(ticket);
}
