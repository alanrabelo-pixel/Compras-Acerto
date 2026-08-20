import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readFile } from "@/lib/storage";
import { exigirLeituraDeChamado, exigirLeituraDeSolicitacao, semAcesso } from "@/lib/acesso";

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

// GET /api/attachments/[id]/file: baixa o anexo (local em dev, Vercel Blob em produção; ver src/lib/storage.ts).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const attachment = await prisma.attachment.findUnique({ where: { id: params.id } });
  if (!attachment) return NextResponse.json({ error: "Anexo não encontrado" }, { status: 404 });

  // O anexo não tem dono próprio: herda o de quem ele está pendurado. Um
  // Attachment pertence a uma PurchaseRequest OU a um SimpleTicket, nunca aos
  // dois (ver o model no schema), então a guarda delega para a leitura do dono
  // e o anexo passa a valer exatamente o mesmo que a solicitação ou o chamado
  // em que ele está. Isto vem antes de readFile de propósito: sem a guarda, a
  // rota buscava e devolvia proposta comercial, contrato escaneado e nota
  // fiscal para qualquer conta autenticada.
  let barrado: NextResponse | null;
  if (attachment.requestId) {
    barrado = await exigirLeituraDeSolicitacao(attachment.requestId);
  } else if (attachment.ticketId) {
    barrado = await exigirLeituraDeChamado(attachment.ticketId);
  } else {
    // Anexo órfão (sem solicitação e sem chamado) não tem a quem consultar.
    // Falha fechado: liberar o que não dá para verificar é justamente o furo
    // que esta guarda existe para tapar. Nega inclusive sob LOCAL_BYPASS_AUTH,
    // porque órfão aqui é anomalia de dado, não caso de uso.
    barrado = semAcesso("Você não tem acesso a este anexo.");
  }
  if (barrado) return barrado;

  const buffer = await readFile(attachment.storageUrl);
  const ext = attachment.fileName.split(".").pop()?.toLowerCase() ?? "";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": MIME_BY_EXT[ext] ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${attachment.fileName}"`,
    },
  });
}
