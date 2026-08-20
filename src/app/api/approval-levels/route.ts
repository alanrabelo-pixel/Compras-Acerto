import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { USUARIO_PUBLICO } from "@/lib/usuario";
import { exigirPapel } from "@/lib/acesso";

const LEVELS = [1, 2, 3];

/**
 * GET /api/approval-levels: os 3 níveis de alçada (ver approvalLevel() em
 * src/lib/workflow.ts) e o(s) aprovador(es) configurado(s) para cada um (ver
 * /admin/centros-de-custo). Mais de um aprovador por nível é permitido
 * (pedido do usuário).
 */
export async function GET() {
  // Quem aprova cada faixa de valor é informação de controle interno, e a tela
  // que edita isso (/admin/centros-de-custo) já é restrita a ADMIN pelo
  // middleware. canViewBoard aqui seria largo demais.
  const barrado = await exigirPapel(["ADMIN"], "a configuração de alçadas");
  if (barrado) return barrado;

  const rows = await prisma.approvalLevelApprover.findMany({
    where: { level: { in: LEVELS } },
    include: { user: { select: USUARIO_PUBLICO } },
  });
  const levels = LEVELS.map((level) => ({
    level,
    approvers: rows.filter((r) => r.level === level).map((r) => r.user),
  }));
  return NextResponse.json(levels);
}
