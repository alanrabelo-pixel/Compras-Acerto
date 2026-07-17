import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { saveLocalFile } from "@/lib/storage";
import type { AttachmentCategory, Stage } from "@prisma/client";

export const runtime = "nodejs";

// GET /api/requests/[id]/attachments — lista anexos da solicitação.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const attachments = await prisma.attachment.findMany({
    where: { requestId: params.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(attachments);
}

// POST /api/requests/[id]/attachments — upload (multipart/form-data: file, uploadedBy, stage).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const request = await prisma.purchaseRequest.findUnique({ where: { id: params.id } });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  const uploadedBy = form.get("uploadedBy");
  const stage = (form.get("stage") as string) || request.currentStage;
  const category = (form.get("category") as AttachmentCategory) || "GERAL";

  if (!(file instanceof Blob) || !("name" in file)) {
    return NextResponse.json({ error: "Arquivo ausente no campo 'file'." }, { status: 400 });
  }
  if (!uploadedBy || typeof uploadedBy !== "string") {
    return NextResponse.json({ error: "Campo obrigatório ausente: uploadedBy" }, { status: 400 });
  }

  const fileName = (file as File).name;
  const buffer = Buffer.from(await file.arrayBuffer());
  const storageUrl = await saveLocalFile(request.id, fileName, buffer);

  const attachment = await prisma.attachment.create({
    data: { requestId: request.id, fileName, storageUrl, uploadedBy, stage: stage as Stage, category },
  });

  return NextResponse.json(attachment, { status: 201 });
}
