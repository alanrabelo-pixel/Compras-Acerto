import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { bypassAuthAtivo } from "@/lib/bypass";
import { comExcecaoControlada } from "@/lib/validacao-api";

/**
 * POST /api/users/import: cadastra várias pessoas de uma vez, como
 * SOLICITANTE, ANTES de qualquer login via SSO (pedido do dono do sistema em
 * 27/08/2026, pra poder configurar centro de custo e aprovadores sem esperar
 * cada pessoa entrar pelo menos uma vez).
 *
 * O primeiro login real (ver signIn em src/lib/auth.ts) faz o MESMO upsert
 * por e-mail: quando a pessoa entrar de verdade, só preenche googleId nesta
 * mesma linha, sem duplicar nem apagar o que já foi concedido em
 * /admin/acessos. Por isso esta rota NUNCA sobrescreve quem já existe: só
 * cria quem ainda não tem linha, e reporta quem já tinha.
 */
export async function POST(req: NextRequest) {
  return comExcecaoControlada("POST /api/users/import", async () => {
    if (!bypassAuthAtivo()) {
      const session = await getServerSession(authOptions);
      const roles = (session?.user as { roles?: string[] } | undefined)?.roles ?? [];
      if (!session || !roles.includes("ADMIN")) {
        return NextResponse.json({ error: "Apenas administradores podem importar usuários." }, { status: 403 });
      }
    }

    const body = await req.json();
    const usuarios = body.users as unknown;
    if (!Array.isArray(usuarios) || usuarios.length === 0) {
      return NextResponse.json({ error: "Envie ao menos um usuário (nome e e-mail)." }, { status: 400 });
    }

    const criados: string[] = [];
    const jaExistiam: string[] = [];
    const invalidos: string[] = [];

    for (const bruto of usuarios) {
      const nome = typeof bruto?.name === "string" ? bruto.name.trim() : "";
      const email = typeof bruto?.email === "string" ? bruto.email.trim().toLowerCase() : "";

      if (!nome || !email.endsWith("@acerto.com.br")) {
        invalidos.push(`${bruto?.name ?? "(sem nome)"} <${bruto?.email ?? "(sem e-mail)"}>`);
        continue;
      }

      const existente = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (existente) {
        jaExistiam.push(email);
        continue;
      }

      await prisma.user.create({
        data: { name: nome, email, roles: { create: [{ role: "SOLICITANTE" }] } },
      });
      criados.push(email);
    }

    return NextResponse.json({ criados, jaExistiam, invalidos });
  });
}
