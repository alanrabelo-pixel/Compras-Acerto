import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/contracts/search?q=texto — lista/busca contratos ATIVOS (por razão
// social, nome fantasia ou objeto do contrato). Usado pelo ContractPicker no
// fluxo de "Dúvida sobre contrato ativo" em Jurídico (NdaRequestForm.tsx) —
// mesmo padrão de /api/suppliers, só filtrado a status=ATIVO.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");

  const contracts = await prisma.contract.findMany({
    where: {
      status: "ATIVO",
      ...(q
        ? {
            OR: [
              { supplierName: { contains: q, mode: "insensitive" } },
              { supplierTradeName: { contains: q, mode: "insensitive" } },
              { contractObject: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: { id: true, supplierName: true, supplierTradeName: true, contractObject: true },
    orderBy: { supplierName: "asc" },
    take: 25,
  });

  return NextResponse.json(contracts);
}
