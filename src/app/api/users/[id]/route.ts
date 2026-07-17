import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/db";

/**
 * PATCH /api/users/[id] — hoje só usado para alternar canViewBoard (acesso
 * ao quadro/Contratos/Dashboards). Autenticação por sessão real (não pelo
 * padrão actorId-no-corpo usado no resto da API) porque é o próprio
 * mecanismo de controle de acesso — confiar num id enviado no corpo
 * anularia a proteção.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const roles = (session?.user as { roles?: string[] } | undefined)?.roles ?? [];
  if (!session || !roles.includes("ADMIN")) {
    return NextResponse.json({ error: "Apenas administradores podem alterar acessos." }, { status: 403 });
  }

  const body = await req.json();
  if (typeof body.canViewBoard !== "boolean") {
    return NextResponse.json({ error: "Campo obrigatório ausente: canViewBoard (boolean)" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: params.id },
    data: { canViewBoard: body.canViewBoard },
  });

  return NextResponse.json({ id: user.id, email: user.email, canViewBoard: user.canViewBoard });
}
