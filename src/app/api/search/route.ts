import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { STAGES } from "@/lib/workflow";
import { USUARIO_RESUMIDO } from "@/lib/usuario";
import { exigirQuadro } from "@/lib/acesso";
import { CATEGORY_ENUM_TO_SLUG, TICKET_CATEGORIES, TICKET_STATUS_LABEL } from "@/lib/tickets";

export type SearchResult = {
  type: "solicitacao" | "contrato" | "chamado" | "fornecedor" | "centro-de-custo" | "pessoa";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

/**
 * GET /api/search?q=texto: busca global (Command Palette, Ctrl+K).
 *
 * COBRE O SISTEMA INTEIRO desde 21/08/2026. Antes só olhava Solicitações
 * (código, descrição, solicitante) e Contratos (fornecedor, CNPJ), o que fazia
 * a busca falhar em silêncio para o resto: procurar por um centro de custo, um
 * chamado ou um fornecedor devolvia lista vazia, indistinguível de "não
 * existe". A finalidade do campo é achar qualquer coisa que o sistema guarda.
 *
 * ONDE CADA COISA LEVA. Nem todo tipo tem tela própria, e nesses casos o
 * resultado leva para a lista já FILTRADA por ele, que é o que a pessoa quer
 * ao procurar: buscar um centro de custo abre o quadro daquele centro, e
 * buscar uma pessoa abre o quadro das solicitações dela. Levar para uma tela
 * de cadastro seria tecnicamente correto e inútil.
 *
 * RECORTE DE ACESSO: `exigirQuadro` continua na porta, antes até de ler o
 * termo, porque o próprio resultado (código, descrição, fornecedor, CNPJ,
 * nome de pessoa) já é o vazamento. Todos os tipos acrescentados aqui são
 * visíveis para quem tem quadro pelas telas normais, então a busca não amplia
 * o que ninguém já podia ver. Quem NÃO tem quadro continua recebendo 403 e
 * lista vazia, inclusive para as próprias solicitações: é limitação anterior a
 * esta mudança, registrada em docs/registro-2026-08-21.md.
 */

/** Por tipo, para um tipo com muitos resultados não engolir os outros. */
const LIMITE_POR_TIPO = 5;

export async function GET(req: NextRequest) {
  const barrado = await exigirQuadro("a busca geral");
  if (barrado) return barrado;

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json([]);

  const texto = { contains: q, mode: "insensitive" as const };

  const [requests, contracts, tickets, suppliers, costCenters, people] = await Promise.all([
    prisma.purchaseRequest.findMany({
      where: {
        OR: [
          { code: texto },
          { shortDescription: texto },
          { longDescription: texto },
          { budgetLineText: texto },
          { indicatedSupplierName: texto },
          { requester: { name: texto } },
          { costCenter: { name: texto } },
        ],
      },
      include: { requester: { select: USUARIO_RESUMIDO }, costCenter: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: LIMITE_POR_TIPO,
    }),
    prisma.contract.findMany({
      where: {
        OR: [
          { supplierName: texto },
          { supplierTradeName: texto },
          { supplierCnpj: texto },
          { contractObject: texto },
          { area: texto },
          { costCenter: texto },
          { contractManager: { name: texto } },
        ],
      },
      include: { contractManager: { select: USUARIO_RESUMIDO } },
      orderBy: { renewalDate: "asc" },
      take: LIMITE_POR_TIPO,
    }),
    prisma.simpleTicket.findMany({
      where: {
        OR: [
          { code: texto },
          { description: texto },
          { requesterName: texto },
          { requesterEmail: texto },
          { supplierName: texto },
          { contractSupplierName: texto },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: LIMITE_POR_TIPO,
    }),
    prisma.supplier.findMany({
      where: { OR: [{ legalName: texto }, { tradeName: texto }, { cnpj: texto }, { contactName: texto }] },
      orderBy: { legalName: "asc" },
      take: LIMITE_POR_TIPO,
    }),
    prisma.costCenter.findMany({
      where: { name: texto },
      select: { id: true, name: true, active: true, _count: { select: { requests: true } } },
      orderBy: { name: "asc" },
      take: LIMITE_POR_TIPO,
    }),
    prisma.user.findMany({
      where: { active: true, OR: [{ name: texto }, { email: texto }] },
      select: { ...USUARIO_RESUMIDO, roles: { select: { role: true } } },
      orderBy: { name: "asc" },
      take: LIMITE_POR_TIPO,
    }),
  ]);

  const results: SearchResult[] = [
    ...requests.map((r) => ({
      type: "solicitacao" as const,
      id: r.id,
      title: `${r.code} · ${r.shortDescription}`,
      subtitle: `${STAGES[r.currentStage].label} · ${r.requester.name} · ${r.costCenter.name}`,
      href: `/solicitacoes/${r.id}`,
    })),
    ...contracts.map((c) => ({
      type: "contrato" as const,
      id: c.id,
      title: c.supplierName,
      subtitle: [
        "Contrato",
        c.supplierTradeName || null,
        c.contractManager ? `gestor: ${c.contractManager.name}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      href: `/contratos/${c.id}`,
    })),
    ...tickets.map((t) => {
      const slug = CATEGORY_ENUM_TO_SLUG[t.category];
      return {
        type: "chamado" as const,
        id: t.id,
        title: `${t.code} · ${t.description.slice(0, 60)}${t.description.length > 60 ? "…" : ""}`,
        subtitle: `${TICKET_CATEGORIES[slug].label} · ${TICKET_STATUS_LABEL[t.status] ?? t.status} · ${t.requesterName}`,
        href: `/chamados/${slug}/${t.id}`,
      };
    }),
    ...suppliers.map((s) => ({
      type: "fornecedor" as const,
      id: s.id,
      title: s.tradeName ? `${s.legalName} (${s.tradeName})` : s.legalName,
      subtitle: `Fornecedor · CNPJ ${s.cnpj}`,
      // Fornecedor não tem tela própria: leva para os contratos dele, que é o
      // que se quer ver ao procurar por um fornecedor.
      href: `/contratos?q=${encodeURIComponent(s.legalName)}`,
    })),
    ...costCenters.map((cc) => ({
      type: "centro-de-custo" as const,
      id: cc.id,
      title: cc.name,
      subtitle: `Centro de custo${cc.active ? "" : " (inativo)"} · ${cc._count.requests} solicitação(ões)`,
      // Leva ao quadro já filtrado, e não à tela de administração: quem
      // procura um centro de custo quer ver o que está rodando nele.
      href: `/solicitacoes?costCenterId=${cc.id}`,
    })),
    ...people.map((u) => ({
      type: "pessoa" as const,
      id: u.id,
      title: u.name,
      subtitle: `${u.email}${u.roles.length > 0 ? ` · ${u.roles.map((r) => r.role).join(", ")}` : ""}`,
      href: `/solicitacoes?q=${encodeURIComponent(u.name)}`,
    })),
  ];

  return NextResponse.json(results);
}
