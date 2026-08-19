import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { bypassAuthAtivo } from "@/lib/bypass";

/**
 * PATCH /api/approval-levels/[level]: troca o(s) aprovador(es) padrão de
 * uma alçada de valor (Nível 1/2/3, ver /admin/centros-de-custo). Mais de um
 * é permitido (pedido do usuário). Mesmo padrão de autenticação de
 * /api/cost-centers/[id]/route.ts.
 *
 * Ao trocar, migra as Aprovações já criadas nesse nível e ainda PENDENTES
 * para o primeiro do novo conjunto, pois a troca precisa
 * refletir no fluxo em andamento (pedido do usuário). Aprovações já decididas (APROVADO/
 * REPROVADO) mantêm o aprovador original (preserva quem de fato decidiu).
 */
export async function PATCH(req: NextRequest, { params }: { params: { level: string } }) {
  const level = Number(params.level);
  if (!Number.isInteger(level) || level < 1 || level > 3) {
    return NextResponse.json({ error: "Nível inválido (esperado 1, 2 ou 3)" }, { status: 400 });
  }

  if (!bypassAuthAtivo()) {
    const session = await getServerSession(authOptions);
    const roles = (session?.user as { roles?: string[] } | undefined)?.roles ?? [];
    if (!session || !roles.includes("ADMIN")) {
      return NextResponse.json({ error: "Apenas administradores podem alterar alçadas de aprovação." }, { status: 403 });
    }
  }

  const body = await req.json();
  if (!Array.isArray(body.approverIds) || !body.approverIds.every((id: unknown) => typeof id === "string")) {
    return NextResponse.json({ error: "approverIds deve ser um array de strings" }, { status: 400 });
  }
  const approverIds: string[] = body.approverIds;

  await prisma.$transaction([
    prisma.approvalLevelApprover.deleteMany({ where: { level } }),
    prisma.approvalLevelApprover.createMany({ data: approverIds.map((userId) => ({ level, userId })) }),
  ]);

  // Approval.approverId não aceita null: só migra as pendentes quando o
  // novo conjunto tem pelo menos um aprovador; limpar tudo não mexe nas já
  // criadas (ficam com o último aprovador válido).
  if (approverIds.length > 0) {
    await prisma.approval.updateMany({
      where: { level, decision: "PENDENTE" },
      data: { approverId: approverIds[0] },
    });
  }

  const users = approverIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: approverIds } } })
    : [];
  return NextResponse.json({ level, approvers: users });
}
