import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { saveFile } from "@/lib/storage";

export const runtime = "nodejs";

// GET /api/tickets/[id]/attachments: lista anexos do chamado.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const attachments = await prisma.attachment.findMany({
    where: { ticketId: params.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(attachments);
}

// POST /api/tickets/[id]/attachments: upload (multipart/form-data: file, uploadedBy).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ticket = await prisma.simpleTicket.findUnique({ where: { id: params.id } });
  if (!ticket) return NextResponse.json({ error: "Chamado não encontrado" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  const uploadedBy = form.get("uploadedBy");

  if (!(file instanceof Blob) || !("name" in file)) {
    return NextResponse.json({ error: "Arquivo ausente no campo 'file'." }, { status: 400 });
  }
  if (!uploadedBy || typeof uploadedBy !== "string") {
    return NextResponse.json({ error: "Campo obrigatório ausente: uploadedBy" }, { status: 400 });
  }

  const fileName = (file as File).name;
  const buffer = Buffer.from(await file.arrayBuffer());
  const storageUrl = await saveFile(ticket.id, fileName, buffer);

  const attachment = await prisma.attachment.create({
    data: { ticketId: ticket.id, fileName, storageUrl, uploadedBy },
  });

  return NextResponse.json(attachment, { status: 201 });
}
