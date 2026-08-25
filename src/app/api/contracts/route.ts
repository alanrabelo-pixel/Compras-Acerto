import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { USUARIO_PUBLICO } from "@/lib/usuario";
import { exigirQuadro } from "@/lib/acesso";

// Sem parâmetro no GET, o Next.js tenta pré-renderizar esta rota em tempo de
// build (acha que é "estática") e quebra o build sem banco disponível, por
// exemplo no runner de CI. force-dynamic desliga essa tentativa. Veio da
// versão de infraestrutura do time de engenharia, em 25/08/2026.
export const dynamic = "force-dynamic";

// GET /api/contracts: lista contratos (para a tela de gestão de contratos).
export async function GET() {
  // Listagem ampla, sem recorte por registro: exige o mesmo canViewBoard que o
  // middleware já exige para a tela /contratos.
  const barrado = await exigirQuadro("a carteira de contratos");
  if (barrado) return barrado;

  const contracts = await prisma.contract.findMany({
    include: { contractManager: { select: USUARIO_PUBLICO }, alerts: true },
    orderBy: { renewalDate: "asc" },
  });
  return NextResponse.json(contracts);
}
