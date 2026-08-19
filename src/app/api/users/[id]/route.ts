import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { RoleName } from "@prisma/client";
import { BOARD_ROLES } from "@/lib/roles";
import { bypassAuthAtivo } from "@/lib/bypass";
import { registrarMudancaDePermissao, comoTexto } from "@/lib/auditoria-permissao";

/**
 * PATCH /api/users/[id]: gerencia os "5 tipos de acesso" (Admin, Compras,
 * Solicitante, Aprovador, Controladoria) de uma pessoa, via
 * src/components/RoleAccessToggles.tsx. Reaproveita UserRole (a mesma tabela
 * usada por requireRole() nas ações de etapa do fluxo) em vez de um campo
 * separado: só mexe nos 5 valores gerenciados aqui, preservando papéis de
 * dono de etapa (TESOURARIA, FISCAL, JURIDICO, PRIVACIDADE) que não fazem
 * parte desses 5 tipos.
 *
 * canViewBoard (usado pelo middleware para liberar o quadro de Solicitações,
 * Contratos e Dashboards) é recalculado automaticamente a partir do conjunto
 * final de papéis: verdadeiro se a pessoa tiver ADMIN, COMPRADOR, APROVADOR
 * ou CONTROLADORIA. Solicitante sozinho não dá acesso ao quadro.
 *
 * Autenticação por sessão real (não pelo padrão actorId-no-corpo usado no
 * resto da API) porque é o próprio mecanismo de controle de acesso: confiar
 * num id enviado no corpo anularia a proteção. Respeita LOCAL_BYPASS_AUTH
 * (ver .env e middleware.ts) para continuar utilizável localmente enquanto o
 * SSO real não está configurado.
 */
const MANAGED_ROLES: RoleName[] = ["ADMIN", "COMPRADOR", "SOLICITANTE", "APROVADOR", "CONTROLADORIA"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!bypassAuthAtivo()) {
    const session = await getServerSession(authOptions);
    const roles = (session?.user as { roles?: string[] } | undefined)?.roles ?? [];
    if (!session || !roles.includes("ADMIN")) {
      return NextResponse.json({ error: "Apenas administradores podem alterar acessos." }, { status: 403 });
    }
  }

  const body = await req.json();

  // active: liga/desliga o acesso da pessoa (desativação estilo "soft delete"
  // para refletir contas removidas no Google Workspace/SSO) sem apagar
  // nenhum histórico, pois nenhuma FK aponta para este campo. Então
  // PurchaseRequest/Contract/Approval etc. continuam intactos.
  if (typeof body.active === "boolean") {
    const antes = await prisma.user.findUnique({ where: { id: params.id }, select: { active: true } });
    const user = await prisma.user.update({ where: { id: params.id }, data: { active: body.active }, include: { roles: true } });
    await registrarMudancaDePermissao({
      targetUserId: params.id,
      kind: "ACESSO_ATIVO",
      antes: antes?.active ? "ativo" : "inativo",
      depois: user.active ? "ativo" : "inativo",
    });
    return NextResponse.json({ id: user.id, email: user.email, active: user.active, roles: user.roles.map((r) => r.role) });
  }

  const requested: unknown = body.roles;
  if (!Array.isArray(requested) || !requested.every((r) => typeof r === "string")) {
    return NextResponse.json({ error: "Informe os tipos de acesso a conceder, ou se a pessoa fica ativa ou inativa." }, { status: 400 });
  }
  const invalid = requested.filter((r) => !MANAGED_ROLES.includes(r as RoleName));
  if (invalid.length > 0) {
    return NextResponse.json({ error: `Tipo(s) de acesso desconhecido(s): ${invalid.join(", ")}` }, { status: 400 });
  }
  const nextManagedRoles = requested as RoleName[];

  // Lido ANTES do deleteMany: é a única chance de saber o que havia, já que a
  // remoção não deixava rastro nenhum.
  const papeisAntes = await prisma.userRole.findMany({
    where: { userId: params.id, role: { in: MANAGED_ROLES } },
    select: { role: true },
  });

  await prisma.userRole.deleteMany({ where: { userId: params.id, role: { in: MANAGED_ROLES } } });
  if (nextManagedRoles.length > 0) {
    await prisma.userRole.createMany({
      data: nextManagedRoles.map((role) => ({ userId: params.id, role })),
      skipDuplicates: true,
    });
  }

  await registrarMudancaDePermissao({
    targetUserId: params.id,
    kind: "PAPEL",
    antes: comoTexto(papeisAntes.map((p) => p.role)),
    depois: comoTexto(nextManagedRoles),
  });

  const allRoles = await prisma.userRole.findMany({ where: { userId: params.id } });
  const canViewBoard = allRoles.some((r) => BOARD_ROLES.includes(r.role));

  const user = await prisma.user.update({
    where: { id: params.id },
    data: { canViewBoard },
    include: { roles: true },
  });

  return NextResponse.json({ id: user.id, email: user.email, canViewBoard: user.canViewBoard, roles: user.roles.map((r) => r.role) });
}
