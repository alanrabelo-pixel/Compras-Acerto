import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/cost-centers — lista centros de custo ativos, para o formulário de
// Nova Solicitação. Inclui os gestores (nome) para exibir quem vai aprovar
// antes de enviar — ver APROVACAO_GESTOR em src/lib/workflow.ts. Mais de um
// gestor por centro de custo é permitido (pedido do usuário).
export async function GET() {
  const costCenters = await prisma.costCenter.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: { managers: { select: { name: true } } },
  });
  return NextResponse.json(costCenters);
}

// POST /api/cost-centers — cria um novo centro de custo (painel
// /admin/centros-de-custo, pedido do usuário). Mesmo padrão de autenticação
// de /api/cost-centers/[id]/route.ts.
export async function POST(req: NextRequest) {
  if (process.env.LOCAL_BYPASS_AUTH !== "true") {
    const session = await getServerSession(authOptions);
    const roles = (session?.user as { roles?: string[] } | undefined)?.roles ?? [];
    if (!session || !roles.includes("ADMIN")) {
      return NextResponse.json({ error: "Apenas administradores podem criar centros de custo." }, { status: 403 });
    }
  }

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Campo obrigatório ausente: name" }, { status: 400 });

  const managerIds: string[] = Array.isArray(body.managerIds) ? body.managerIds : [];

  const costCenter = await prisma.costCenter.create({
    data: { name, managers: { connect: managerIds.map((id) => ({ id })) } },
    include: { managers: true },
  });

  return NextResponse.json(costCenter, { status: 201 });
}
