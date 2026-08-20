import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { bypassAuthAtivo } from "@/lib/bypass";
import { USUARIO_PUBLICO } from "@/lib/usuario";

/**
 * PATCH /api/cost-centers/[id] (painel /admin/centros-de-custo): troca o(s)
 * gestor(es) aprovador(es) (managerIds, mais de um permitido, pedido do
 * usuário) e/ou ativa/desativa o centro de custo. Autenticação por sessão
 * real (mesmo padrão de /api/users/[id]/route.ts), pois não está sob o matcher
 * /admin/:path* do middleware (que só cobre páginas), então a checagem de
 * ADMIN precisa ser feita aqui.
 *
 * Ao trocar os gestores, solicitações já paradas na etapa APROVACAO_GESTOR
 * deste centro de custo (e ainda não decididas) são migradas para o
 * primeiro do novo conjunto, pois a atualização precisa
 * refletir em todo o fluxo em andamento, não só nas solicitações futuras.
 * Solicitações já decididas não são tocadas (preserva o histórico).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!bypassAuthAtivo()) {
    const session = await getServerSession(authOptions);
    const roles = (session?.user as { roles?: string[] } | undefined)?.roles ?? [];
    if (!session || !roles.includes("ADMIN")) {
      return NextResponse.json({ error: "Apenas administradores podem alterar centros de custo." }, { status: 403 });
    }
  }

  const body = await req.json();
  const data: { managers?: { set: { id: string }[] }; active?: boolean } = {};

  if ("managerIds" in body) {
    if (!Array.isArray(body.managerIds) || !body.managerIds.every((id: unknown) => typeof id === "string")) {
      return NextResponse.json({ error: "Selecione ao menos uma pessoa como gestora deste centro de custo." }, { status: 400 });
    }
    data.managers = { set: body.managerIds.map((id: string) => ({ id })) };
  }
  if (typeof body.active === "boolean") {
    data.active = body.active;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar (esperado managerIds e/ou active)" }, { status: 400 });
  }

  const costCenter = await prisma.costCenter.update({
    where: { id: params.id },
    data,
    include: { managers: { select: USUARIO_PUBLICO } },
  });

  if ("managerIds" in body) {
    const newPrimary = costCenter.managers[0]?.id ?? null;
    await prisma.purchaseRequest.updateMany({
      where: { costCenterId: params.id, currentStage: "APROVACAO_GESTOR", managerApprovalDecision: null },
      data: { approverManagerId: newPrimary },
    });
  }

  return NextResponse.json(costCenter);
}
