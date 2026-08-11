import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const LEVELS = [1, 2, 3];

/**
 * GET /api/approval-levels — os 3 níveis de alçada (ver approvalLevel() em
 * src/lib/workflow.ts) e o(s) aprovador(es) configurado(s) para cada um (ver
 * /admin/centros-de-custo). Mais de um aprovador por nível é permitido
 * (pedido do usuário).
 */
export async function GET() {
  const rows = await prisma.approvalLevelApprover.findMany({
    where: { level: { in: LEVELS } },
    include: { user: true },
  });
  const levels = LEVELS.map((level) => ({
    level,
    approvers: rows.filter((r) => r.level === level).map((r) => r.user),
  }));
  return NextResponse.json(levels);
}
