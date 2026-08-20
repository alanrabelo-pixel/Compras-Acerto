import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { saveFile } from "@/lib/storage";
import { validarAnexo } from "@/lib/upload";
import { exigirLeituraDeChamado } from "@/lib/acesso";

export const runtime = "nodejs";

// GET /api/tickets/[id]/attachments: lista anexos do chamado.
// params.id é o chamado dono dos anexos: quem não pode ler o chamado não pode
// ver o que está anexado nele (nome de arquivo já entrega conteúdo, ex.:
// "NDA Fornecedor X.pdf").
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const barrado = await exigirLeituraDeChamado(params.id);
  if (barrado) return barrado;

  const attachments = await prisma.attachment.findMany({
    where: { ticketId: params.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(attachments);
}

// POST /api/tickets/[id]/attachments: upload (multipart/form-data: file, uploadedBy).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // Mesmo recorte do GET, e pelo mesmo motivo: params.id é o chamado dono do
  // anexo. Sem isto, qualquer conta autenticada com o id de um chamado alheio
  // na mão pendurava arquivo dentro dele, e o arquivo passa a ser servido por
  // /api/attachments/[id]/file para quem lê aquele chamado. Vem antes da busca
  // do chamado de propósito: exigirLeituraDeChamado já responde 403 para
  // chamado inexistente, e responder 404 antes dela confirmaria a existência
  // do id para quem não tem acesso nenhum.
  const barrado = await exigirLeituraDeChamado(params.id);
  if (barrado) return barrado;

  const ticket = await prisma.simpleTicket.findUnique({ where: { id: params.id } });
  if (!ticket) return NextResponse.json({ error: "Chamado não encontrado" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  const uploadedBy = form.get("uploadedBy");

  const validacao = validarAnexo(file);
  if (!validacao.ok) {
    return NextResponse.json({ error: validacao.erro }, { status: validacao.status });
  }
  if (!uploadedBy || typeof uploadedBy !== "string") {
    return NextResponse.json({ error: "Informe quem está anexando o arquivo." }, { status: 400 });
  }

  const fileName = validacao.nomeDoArquivo;
  const buffer = Buffer.from(await (file as Blob).arrayBuffer());
  const storageUrl = await saveFile(ticket.id, fileName, buffer);

  const attachment = await prisma.attachment.create({
    data: { ticketId: ticket.id, fileName, storageUrl, uploadedBy },
  });

  // Ver comentário equivalente na rota de anexo de solicitação.
  const { storageUrl: _omitido, ...semUrlInterna } = attachment;
  return NextResponse.json(semUrlInterna, { status: 201 });
}
