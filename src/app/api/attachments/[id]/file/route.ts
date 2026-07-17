import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readLocalFile } from "@/lib/storage";

export const runtime = "nodejs";

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  csv: "text/csv",
  txt: "text/plain",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

// GET /api/attachments/[id]/file — baixa o anexo (stand-in local; ver src/lib/storage.ts).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const attachment = await prisma.attachment.findUnique({ where: { id: params.id } });
  if (!attachment) return NextResponse.json({ error: "Anexo não encontrado" }, { status: 404 });

  const buffer = await readLocalFile(attachment.storageUrl);
  const ext = attachment.fileName.split(".").pop()?.toLowerCase() ?? "";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": MIME_BY_EXT[ext] ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${attachment.fileName}"`,
    },
  });
}
