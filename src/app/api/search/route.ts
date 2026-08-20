import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { STAGES } from "@/lib/workflow";
import { USUARIO_RESUMIDO } from "@/lib/usuario";
import { exigirQuadro } from "@/lib/acesso";

export type SearchResult = {
  type: "solicitacao" | "contrato";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

/**
 * GET /api/search?q=texto: busca global (Command Palette, Ctrl+K), unindo
 * Solicitações (código/descrição/solicitante) e Contratos (fornecedor/CNPJ)
 * num único resultado ordenável por relevância simples (mais recente
 * primeiro dentro de cada tipo). Poucos registros por tipo, pois é uma busca
 * rápida de navegação, não um relatório.
 */
export async function GET(req: NextRequest) {
  // Antes até da leitura do termo: a busca varre a carteira inteira de
  // solicitações e de contratos, sem recorte por registro, e o próprio
  // resultado (código, descrição, fornecedor, CNPJ) já é o vazamento.
  const barrado = await exigirQuadro("a busca geral");
  if (barrado) return barrado;

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json([]);

  const [requests, contracts] = await Promise.all([
    prisma.purchaseRequest.findMany({
      where: {
        OR: [
          { code: { contains: q, mode: "insensitive" } },
          { shortDescription: { contains: q, mode: "insensitive" } },
          { requester: { name: { contains: q, mode: "insensitive" } } },
        ],
      },
      include: { requester: { select: USUARIO_RESUMIDO } },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.contract.findMany({
      where: {
        OR: [
          { supplierName: { contains: q, mode: "insensitive" } },
          { supplierTradeName: { contains: q, mode: "insensitive" } },
          { supplierCnpj: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { renewalDate: "asc" },
      take: 6,
    }),
  ]);

  const results: SearchResult[] = [
    ...requests.map((r) => ({
      type: "solicitacao" as const,
      id: r.id,
      title: `${r.code} · ${r.shortDescription}`,
      subtitle: `${STAGES[r.currentStage].label} · ${r.requester.name}`,
      href: `/solicitacoes/${r.id}`,
    })),
    ...contracts.map((c) => ({
      type: "contrato" as const,
      id: c.id,
      title: c.supplierName,
      subtitle: c.supplierTradeName ? `Contrato · ${c.supplierTradeName}` : "Contrato",
      href: `/contratos/${c.id}`,
    })),
  ];

  return NextResponse.json(results);
}
