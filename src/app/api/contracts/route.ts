import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { USUARIO_PUBLICO } from "@/lib/usuario";

// GET /api/contracts: lista contratos (para a tela de gestão de contratos).
export async function GET() {
  const contracts = await prisma.contract.findMany({
    include: { contractManager: { select: USUARIO_PUBLICO }, alerts: true },
    orderBy: { renewalDate: "asc" },
  });
  return NextResponse.json(contracts);
}
