import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { RoleName } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { bypassAuthAtivo } from "@/lib/bypass";
import { ALL_MANAGED_ROLES } from "@/lib/roles";
import { comExcecaoControlada } from "@/lib/validacao-api";

/**
 * POST /api/users/grant-role: CONTORNO TEMPORÁRIO (27/08/2026) enquanto o
 * método PATCH segue bloqueado numa camada de rede na frente da aplicação
 * (achado real, reportado ao Daniel/Engenharia — ver PATCH /api/users/[id],
 * que faz a mesma coisa e deveria ser o caminho normal). Enquanto isso não é
 * corrigido, conceder um papel pela tela de Acessos (RoleAccessToggles) volta
 * 501/"Não foi possível salvar" para qualquer administrador.
 *
 * Só CONCEDE, nunca revoga, e nunca mexe nos outros papéis da pessoa
 * (additive, ao contrário do PATCH que substitui o conjunto inteiro) — é o
 * mínimo necessário pra destravar "tornar alguém Admin/Aprovador/etc." sem
 * reescrever a tela inteira. Remover este arquivo assim que o PATCH voltar a
 * funcionar e a tela de Acessos deixar de precisar dele.
 */
export async function POST(req: NextRequest) {
  return comExcecaoControlada("POST /api/users/grant-role", async () => {
    if (!bypassAuthAtivo()) {
      const session = await getServerSession(authOptions);
      const roles = (session?.user as { roles?: string[] } | undefined)?.roles ?? [];
      if (!session || !roles.includes("ADMIN")) {
        return NextResponse.json({ error: "Apenas administradores podem conceder papéis." }, { status: 403 });
      }
    }

    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = typeof body.role === "string" ? (body.role as RoleName) : null;

    if (!email) return NextResponse.json({ error: "Informe o e-mail da pessoa." }, { status: 400 });
    if (!role || !ALL_MANAGED_ROLES.includes(role)) {
      return NextResponse.json({ error: `Papel inválido. Use um de: ${ALL_MANAGED_ROLES.join(", ")}.` }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, roles: { select: { role: true } } } });
    if (!user) return NextResponse.json({ error: `Nenhum usuário com o e-mail ${email}.` }, { status: 404 });

    if (user.roles.some((r) => r.role === role)) {
      return NextResponse.json({ ok: true, jaTinha: true });
    }

    await prisma.userRole.create({ data: { userId: user.id, role } });

    const canViewBoard = ["ADMIN", "COMPRADOR", "APROVADOR", "CONTROLADORIA"].includes(role);
    if (canViewBoard) {
      await prisma.user.update({ where: { id: user.id }, data: { canViewBoard: true } });
    }

    return NextResponse.json({ ok: true, jaTinha: false });
  });
}
