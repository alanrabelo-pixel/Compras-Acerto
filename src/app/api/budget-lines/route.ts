import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/budget-lines — lista linhas de orçamento, para o campo "Linha do
// Orçamento" do formulário de Nova Solicitação (paridade com o Pipefy).
export async function GET() {
  const budgetLines = await prisma.budgetLine.findMany({ orderBy: { description: "asc" } });
  return NextResponse.json(budgetLines);
}
