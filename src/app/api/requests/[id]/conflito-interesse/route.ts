import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * POST /api/requests/[id]/conflito-interesse
 *
 * Declaração de conflito de interesse (revisão v1.1): solicitante ou
 * comprador declaram se têm relação pessoal/familiar/financeira com o
 * fornecedor proposto. Exigida antes da criação da Aprovação (ver rota
 * /aprovacao). Pode ser declarada mais de uma vez (histórico); a mais
 * recente é a que vale.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const request = await prisma.purchaseRequest.findUnique({ where: { id: params.id } });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });

  const body = await req.json();
  const { declaredBy, hasConflict, details } = body;

  if (!declaredBy) return NextResponse.json({ error: "Informe quem está fazendo a declaração de conflito de interesse." }, { status: 400 });
  if (typeof hasConflict !== "boolean") {
    return NextResponse.json({ error: "Responda se existe ou não conflito de interesse." }, { status: 400 });
  }
  if (hasConflict && !details) {
    return NextResponse.json({ error: "Descreva qual é o conflito, para o time avaliar a reatribuição." }, { status: 422 });
  }

  const declaration = await prisma.conflictOfInterestDeclaration.create({
    data: { requestId: request.id, declaredBy, hasConflict, details },
  });

  return NextResponse.json(declaration, { status: 201 });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const declarations = await prisma.conflictOfInterestDeclaration.findMany({
    where: { requestId: params.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(declarations);
}
