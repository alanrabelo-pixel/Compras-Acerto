import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createAppChatMessage, type ChatRole } from "@/lib/requestChat";

// GET /api/requests/[id]/chat — histórico do widget de chat comprador ↔ solicitante.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const messages = await prisma.requestChatMessage.findMany({
    where: { requestId: params.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ messages });
}

// POST /api/requests/[id]/chat — mensagem enviada pelo widget; espelhada via Slack DM quando possível.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { authorRole, authorName, body: text } = body as { authorRole: ChatRole; authorName: string; body: string };

  if (!authorRole || !["COMPRADOR", "SOLICITANTE"].includes(authorRole)) {
    return NextResponse.json({ error: "authorRole inválido." }, { status: 400 });
  }
  if (!authorName?.trim() || !text?.trim()) {
    return NextResponse.json({ error: "Nome e mensagem são obrigatórios." }, { status: 400 });
  }

  const request = await prisma.purchaseRequest.findUnique({ where: { id: params.id } });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });

  const message = await createAppChatMessage({
    requestId: params.id,
    authorRole,
    authorName: authorName.trim(),
    body: text.trim(),
  });

  return NextResponse.json({ message }, { status: 201 });
}
