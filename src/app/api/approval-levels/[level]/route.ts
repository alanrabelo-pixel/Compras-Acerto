import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { bypassAuthAtivo } from "@/lib/bypass";
import { registrarMudancaDePermissao, comoTexto } from "@/lib/auditoria-permissao";

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
    return NextResponse.json({ error: "Selecione ao menos uma pessoa como aprovadora desta alçada." }, { status: 400 });
  }
  const approverIds: string[] = body.approverIds;

  // Lido ANTES: o deleteMany abaixo apaga quem estava configurado nesta
  // alçada, e essa era a informação que se perdia sem deixar rastro.
  const antes = await prisma.approvalLevelApprover.findMany({
    where: { level },
    include: { user: { select: { name: true } } },
  });

  await prisma.$transaction([
    prisma.approvalLevelApprover.deleteMany({ where: { level } }),
    prisma.approvalLevelApprover.createMany({ data: approverIds.map((userId) => ({ level, userId })) }),
  ]);

  const depois = await prisma.user.findMany({ where: { id: { in: approverIds } }, select: { id: true, name: true } });
  // Um registro por pessoa afetada, tanto quem saiu quanto quem entrou, para a
  // consulta "o que mudou para esta pessoa" encontrar os dois lados.
  const afetados = new Set([...antes.map((a) => a.userId), ...approverIds]);
  const textoAntes = comoTexto(antes.map((a) => a.user.name));
  const textoDepois = comoTexto(depois.map((d) => d.name));
  for (const userId of afetados) {
    await registrarMudancaDePermissao({
      targetUserId: userId,
      kind: "ALCADA",
      antes: `Nível ${level}: ${textoAntes}`,
      depois: `Nível ${level}: ${textoDepois}`,
    });
  }

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
