import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/suppliers?q=texto: lista/busca fornecedores cadastrados (por razão social, nome fantasia ou CNPJ).
// Usado para pré-preencher o formulário de Pedido de Compra quando o fornecedor já tem cadastro.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");

  const suppliers = await prisma.supplier.findMany({
    where: q
      ? {
          OR: [
            { legalName: { contains: q, mode: "insensitive" } },
            { tradeName: { contains: q, mode: "insensitive" } },
            { cnpj: { contains: q } },
          ],
        }
      : undefined,
    orderBy: { legalName: "asc" },
    take: 25,
  });

  return NextResponse.json(suppliers);
}
