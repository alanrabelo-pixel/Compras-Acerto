import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/cost-centers — lista centros de custo ativos, para o formulário de Nova Solicitação.
export async function GET() {
  const costCenters = await prisma.costCenter.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  return NextResponse.json(costCenters);
}
