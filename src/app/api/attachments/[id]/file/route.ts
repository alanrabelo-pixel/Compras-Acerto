import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readFile } from "@/lib/storage";

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

// GET /api/attachments/[id]/file — baixa o anexo (local em dev, Vercel Blob em produção; ver src/lib/storage.ts).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const attachment = await prisma.attachment.findUnique({ where: { id: params.id } });
  if (!attachment) return NextResponse.json({ error: "Anexo não encontrado" }, { status: 404 });

  const buffer = await readFile(attachment.storageUrl);
  const ext = attachment.fileName.split(".").pop()?.toLowerCase() ?? "";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": MIME_BY_EXT[ext] ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${attachment.fileName}"`,
    },
  });
}
