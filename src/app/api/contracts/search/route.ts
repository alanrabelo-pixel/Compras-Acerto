import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/contracts/search?q=texto: busca contratos ATIVOS (por razão
// social, nome fantasia ou objeto do contrato). Usado pelo ContractPicker no
// fluxo de "Dúvida sobre contrato ativo" em Jurídico (NdaRequestForm.tsx),
// mesmo padrão de /api/suppliers, só filtrado a status=ATIVO.
//
// A rota continua aberta a qualquer pessoa autenticada de propósito: o
// formulário de dúvida jurídica sobre contrato ativo é de todo colaborador, e
// exigir canViewBoard aqui tiraria o formulário do ar para quem ele existe
// para atender.
//
// DECISÃO DO DONO DO SISTEMA, 20/08/2026: a listagem inicial FICA. Uma versão
// intermediária desta rota exigia termo de busca e devolvia vazio sem ele, o
// que fechava a exposição mas mudava o comportamento do formulário: quem abria
// deixava de ver as opções antes de digitar. Perguntado, ele escolheu manter o
// que já existe e ganhar a busca por cima, não trocar uma coisa pela outra.
//
// Consequência aceita conscientemente: qualquer pessoa autenticada consegue
// listar os contratos ativos com fornecedor e objeto. É a mesma informação que
// um colega obteria perguntando ao time de Compras, e o formulário de dúvida
// jurídica não funciona sem ela. Está registrada como exceção em
// src/app/api/autorizacao.cobertura.test.ts.
//
// O `take` é o que impede a rota de virar despejo de base: ela devolve uma
// página, não a carteira inteira.
const LIMITE = 25;

export async function GET(req: NextRequest) {
  const termo = (req.nextUrl.searchParams.get("q") ?? "").trim();

  const contracts = await prisma.contract.findMany({
    where: {
      status: "ATIVO",
      ...(termo
        ? {
            OR: [
              { supplierName: { contains: termo, mode: "insensitive" } },
              { supplierTradeName: { contains: termo, mode: "insensitive" } },
              { contractObject: { contains: termo, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    // select em vez de devolver o contrato inteiro: o seletor usa só estes
    // quatro campos, e o registro completo traz valor, cláusulas e CNPJ.
    select: { id: true, supplierName: true, supplierTradeName: true, contractObject: true },
    orderBy: { supplierName: "asc" },
    take: LIMITE,
  });

  return NextResponse.json(contracts);
}
