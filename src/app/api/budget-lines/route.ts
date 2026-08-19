import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Sem parâmetro no GET, o Next.js tenta pré-renderizar esta rota em tempo de
// build (acha que é "estática") — e quebra o build sem banco disponível
// (ex.: no runner de CI). force-dynamic desliga essa tentativa.
export const dynamic = "force-dynamic";

// GET /api/budget-lines — lista linhas de orçamento, para o campo "Linha do
// Orçamento" do formulário de Nova Solicitação.
export async function GET() {
  const budgetLines = await prisma.budgetLine.findMany({ orderBy: { description: "asc" } });
  return NextResponse.json(budgetLines);
}
