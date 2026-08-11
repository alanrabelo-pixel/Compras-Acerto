import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/cost-centers — lista centros de custo ativos, para o formulário de
// Nova Solicitação. Inclui o gestor (nome) para exibir quem vai aprovar antes
// de enviar — ver APROVACAO_GESTOR em src/lib/workflow.ts.
export async function GET() {
  const costCenters = await prisma.costCenter.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: { manager: { select: { name: true } } },
  });
  return NextResponse.json(costCenters);
}
