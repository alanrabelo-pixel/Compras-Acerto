import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { bypassAuthAtivo } from "@/lib/bypass";
import { garantirPapelDeAprovador } from "@/lib/papel-de-gestor";
import { comExcecaoControlada } from "@/lib/validacao-api";

/**
 * POST /api/cost-centers/import: cria vários centros de custo de uma vez, já
 * com o gestor vinculado (pedido do dono do sistema em 27/08/2026, logo após
 * o cadastro em massa de usuários — ver /api/users/import).
 *
 * Cada item é {name, managerEmail}. O e-mail do gestor precisa já existir
 * (esta rota nunca cria usuário, só resolve o e-mail para o id) — mesma
 * postura do import de usuários: não inventa quem não está no banco.
 *
 * Idempotente por nome: um centro de custo que já existe não é recriado, só
 * ganha o gestor a mais (connect, nunca substitui os gestores que já tinha).
 * O papel APROVADOR é concedido automaticamente via garantirPapelDeAprovador,
 * mesmo mecanismo do POST /api/cost-centers de um só.
 */
export async function POST(req: NextRequest) {
  return comExcecaoControlada("POST /api/cost-centers/import", async () => {
    if (!bypassAuthAtivo()) {
      const session = await getServerSession(authOptions);
      const roles = (session?.user as { roles?: string[] } | undefined)?.roles ?? [];
      if (!session || !roles.includes("ADMIN")) {
        return NextResponse.json({ error: "Apenas administradores podem importar centros de custo." }, { status: 403 });
      }
    }

    const body = await req.json();
    const itens = body.items as unknown;
    if (!Array.isArray(itens) || itens.length === 0) {
      return NextResponse.json({ error: "Envie ao menos um centro de custo (nome e e-mail do gestor)." }, { status: 400 });
    }

    const criados: string[] = [];
    const atualizados: string[] = [];
    const gestorNaoEncontrado: string[] = [];
    const invalidos: string[] = [];

    for (const bruto of itens) {
      const name = typeof bruto?.name === "string" ? bruto.name.trim() : "";
      const managerEmail = typeof bruto?.managerEmail === "string" ? bruto.managerEmail.trim().toLowerCase() : "";

      if (!name || !managerEmail) {
        invalidos.push(`${bruto?.name ?? "(sem nome)"} <${bruto?.managerEmail ?? "(sem e-mail)"}>`);
        continue;
      }

      const gestor = await prisma.user.findUnique({ where: { email: managerEmail }, select: { id: true } });
      if (!gestor) {
        gestorNaoEncontrado.push(`${name}: ${managerEmail}`);
        continue;
      }

      await garantirPapelDeAprovador([gestor.id]);

      const existente = await prisma.costCenter.findUnique({ where: { name }, select: { id: true } });
      if (existente) {
        await prisma.costCenter.update({
          where: { id: existente.id },
          data: { managers: { connect: { id: gestor.id } } },
        });
        atualizados.push(name);
      } else {
        await prisma.costCenter.create({
          data: { name, managers: { connect: { id: gestor.id } } },
        });
        criados.push(name);
      }
    }

    return NextResponse.json({ criados, atualizados, gestorNaoEncontrado, invalidos });
  });
}
