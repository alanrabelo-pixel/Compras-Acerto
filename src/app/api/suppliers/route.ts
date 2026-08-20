import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { atorDaSessao } from "@/lib/acesso";
import { bypassAuthAtivo } from "@/lib/bypass";

// GET /api/suppliers?q=texto: lista/busca fornecedores cadastrados (por razão social, nome fantasia ou CNPJ).
//
// A rota NÃO é restrita ao quadro, e isso é deliberado. Uma versão anterior
// aplicou exigirQuadro aqui, com o raciocínio de que o SupplierPicker só
// aparece no Pedido de Compra. Está errado: o mesmo seletor é usado no
// NdaRequestForm, o formulário de envio de NDA, que abre em
// /chamados/[category]/novo para qualquer colaborador. Restringir tirava do ar
// o formulário para exatamente quem ele existe para atender.
//
// O que é restrito é a AVALIAÇÃO INTERNA DE RISCO (riskTier, approvedVendor,
// screeningStatus): é julgamento da Acerto sobre um terceiro, não deve circular
// para a empresa inteira, e quem precisa dela é o comprador no Pedido de
// Compra. Quem não vê o quadro recebe só o cadastro que o seletor precisa para
// preencher o formulário.
export async function GET(req: NextRequest) {
  const ator = await atorDaSessao();
  const podeVerRisco = bypassAuthAtivo() || Boolean(ator?.veQuadro);

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
    select: {
      id: true,
      legalName: true,
      tradeName: true,
      cnpj: true,
      contactName: true,
      contactPhone: true,
      contactEmail: true,
      // Avaliação interna, só para quem vê o quadro. O select condicional é o
      // que faz o campo não existir na resposta, em vez de sair nulo: nulo
      // ainda contaria uma história sobre o fornecedor.
      ...(podeVerRisco ? { riskTier: true, approvedVendor: true, screeningStatus: true } : {}),
    },
    orderBy: { legalName: "asc" },
    take: 25,
  });

  return NextResponse.json(suppliers);
}
