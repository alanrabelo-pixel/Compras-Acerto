import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { bypassAuthAtivo } from "@/lib/bypass";
import { USUARIO_PUBLICO } from "@/lib/usuario";

/**
 * PATCH /api/users/[id]/cost-centers (painel /admin/centros-de-custo), visão
 * "Por Aprovador": define quais centros de custo esta pessoa pode aprovar
 * (substitui o conjunto inteiro). Mesma relação CostCenter.managers editada
 * em PATCH /api/cost-centers/[id], só que a partir do lado do usuário.
 * Pedido do usuário: uma listagem para escolher, por aprovador, quais
 * centros de custo ele enxerga (ver também src/lib/pendencias.ts, que já
 * filtra "Minhas Pendências" por este mesmo vínculo).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!bypassAuthAtivo()) {
    const session = await getServerSession(authOptions);
    const roles = (session?.user as { roles?: string[] } | undefined)?.roles ?? [];
    if (!session || !roles.includes("ADMIN")) {
      return NextResponse.json({ error: "Apenas administradores podem alterar isso." }, { status: 403 });
    }
  }

  const body = await req.json();
  if (!Array.isArray(body.costCenterIds) || !body.costCenterIds.every((id: unknown) => typeof id === "string")) {
    return NextResponse.json({ error: "Selecione ao menos um centro de custo." }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: params.id },
    data: { costCentersManaged: { set: body.costCenterIds.map((id: string) => ({ id })) } },
    // O model raiz aqui é User, então o recorte tem que vir por select na raiz:
    // um include só de costCentersManaged ainda traria todas as colunas do
    // usuário, chaves de API inclusive.
    select: { ...USUARIO_PUBLICO, costCentersManaged: true },
  });

  return NextResponse.json(user);
}
