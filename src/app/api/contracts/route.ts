import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/contracts — lista contratos (para a tela de gestão de contratos).
export async function GET() {
  const contracts = await prisma.contract.findMany({
    include: { contractManager: true, alerts: true },
    orderBy: { renewalDate: "asc" },
  });
  return NextResponse.json(contracts);
}
