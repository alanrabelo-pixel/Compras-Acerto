import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { saveFile } from "@/lib/storage";
import { validarAnexo } from "@/lib/upload";
import { AttachmentCategory, Stage } from "@prisma/client";

export const runtime = "nodejs";

// GET /api/requests/[id]/attachments: lista anexos da solicitação.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const attachments = await prisma.attachment.findMany({
    where: { requestId: params.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(attachments);
}

// POST /api/requests/[id]/attachments: upload (multipart/form-data: file, uploadedBy, stage).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const request = await prisma.purchaseRequest.findUnique({ where: { id: params.id } });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  const uploadedBy = form.get("uploadedBy");
  // stage e category vinham do cliente com cast direto para o enum, sem
  // conferência: um valor fora da lista só estourava lá no Prisma, virando 500
  // sem explicação. Valor desconhecido agora cai no padrão.
  const stageInformada = form.get("stage");
  const stage: Stage =
    typeof stageInformada === "string" && stageInformada in Stage
      ? (stageInformada as Stage)
      : request.currentStage;
  const categoriaInformada = form.get("category");
  const category: AttachmentCategory =
    typeof categoriaInformada === "string" && categoriaInformada in AttachmentCategory
      ? (categoriaInformada as AttachmentCategory)
      : "GERAL";

  const validacao = validarAnexo(file);
  if (!validacao.ok) {
    return NextResponse.json({ error: validacao.erro }, { status: validacao.status });
  }
  if (!uploadedBy || typeof uploadedBy !== "string") {
    return NextResponse.json({ error: "Informe quem está anexando o arquivo." }, { status: 400 });
  }

  const fileName = validacao.nomeDoArquivo;
  const buffer = Buffer.from(await (file as Blob).arrayBuffer());
  const storageUrl = await saveFile(request.id, fileName, buffer);

  const attachment = await prisma.attachment.create({
    data: { requestId: request.id, fileName, storageUrl, uploadedBy, stage, category },
  });

  // Sem storageUrl na resposta: em produção ela é a URL pública do Vercel Blob,
  // que serve o arquivo direto pelo domínio da Vercel, sem passar por nenhuma
  // checagem de acesso nossa. O cliente não precisa dela, baixa por
  // /api/attachments/[id]/file.
  const { storageUrl: _omitido, ...semUrlInterna } = attachment;
  return NextResponse.json(semUrlInterna, { status: 201 });
}
