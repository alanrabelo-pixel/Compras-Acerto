import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Sem parâmetro no GET, o Next.js tenta pré-renderizar esta rota em tempo de
// build (acha que é "estática") — e quebra o build sem banco disponível
// (ex.: no runner de CI). force-dynamic desliga essa tentativa.
export const dynamic = "force-dynamic";

// GET /api/contracts — lista contratos (para a tela de gestão de contratos).
export async function GET() {
  const contracts = await prisma.contract.findMany({
    include: { contractManager: true, alerts: true },
    orderBy: { renewalDate: "asc" },
  });
  return NextResponse.json(contracts);
}
