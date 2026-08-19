import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { RoleName } from "@prisma/client";

// GET /api/users?role=COMPRADOR: lista usuários ativos, opcionalmente filtrados por papel.
// Usado pelos seletores de usuário nas telas (substitui colar id cru).
export async function GET(req: NextRequest) {
  const role = req.nextUrl.searchParams.get("role") as RoleName | null;

  const users = await prisma.user.findMany({
    where: { active: true, ...(role ? { roles: { some: { role } } } : {}) },
    include: { roles: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    users.map((u) => ({ id: u.id, name: u.name, email: u.email, roles: u.roles.map((r) => r.role) }))
  );
}
