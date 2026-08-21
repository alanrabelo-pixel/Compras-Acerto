import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { bypassAuthAtivo } from "@/lib/bypass";
import { USUARIO_PUBLICO } from "@/lib/usuario";
import { garantirPapelDeAprovador } from "@/lib/papel-de-gestor";

// GET /api/cost-centers: lista centros de custo ativos, para o formulário de
// Nova Solicitação. Inclui os gestores (nome) para exibir quem vai aprovar
// antes de enviar (ver APROVACAO_GESTOR em src/lib/workflow.ts). Mais de um
// gestor por centro de custo é permitido (pedido do usuário).
//
// Sem guarda de propósito, e a exceção está registrada em
// src/app/api/autorizacao.cobertura.test.ts: qualquer colaborador abre
// /solicitacoes/nova e precisa escolher o centro de custo.
//
// `select` explícito em vez de `findMany` sem recorte: a rota é legível por
// toda a empresa, e sem isto qualquer coluna nova em CostCenter passaria a
// sair na resposta sem ninguém decidir isso (é o mesmo modo de falha do
// comentário de User.anthropicApiKey em prisma/schema.prisma). Os dois
// consumidores, NovaSolicitacaoForm e MultiCostCenterPicker, usam id, name e o
// nome dos gestores, nada além.
export async function GET() {
  const costCenters = await prisma.costCenter.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, managers: { select: { name: true } } },
  });
  return NextResponse.json(costCenters);
}

// POST /api/cost-centers: cria um novo centro de custo (painel
// /admin/centros-de-custo, pedido do usuário). Mesmo padrão de autenticação
// de /api/cost-centers/[id]/route.ts.
export async function POST(req: NextRequest) {
  if (!bypassAuthAtivo()) {
    const session = await getServerSession(authOptions);
    const roles = (session?.user as { roles?: string[] } | undefined)?.roles ?? [];
    if (!session || !roles.includes("ADMIN")) {
      return NextResponse.json({ error: "Apenas administradores podem criar centros de custo." }, { status: 403 });
    }
  }

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Informe o nome do centro de custo." }, { status: 400 });

  const managerIds: string[] = Array.isArray(body.managerIds) ? body.managerIds : [];

  await garantirPapelDeAprovador(managerIds);

  const costCenter = await prisma.costCenter.create({
    data: { name, managers: { connect: managerIds.map((id) => ({ id })) } },
    include: { managers: { select: USUARIO_PUBLICO } },
  });

  return NextResponse.json(costCenter, { status: 201 });
}
