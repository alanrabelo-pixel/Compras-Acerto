import { prisma } from "@/lib/db";
import { formatDateOnly } from "@/lib/format";
import { AppShell } from "@/components/AppShell";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { ContractImportUpload } from "@/components/ContractImportUpload";
import { TableWrap, TableHeadRow, TableRow, TableEmpty, Badge } from "@/components/ui";
import type { Prisma, Diretoria } from "@prisma/client";
import { CONTRACT_STATUS_BADGE_VARIANT } from "@/lib/badge-variants";
import { CONTRACT_STATUS_LABEL, rotulo } from "@/lib/rotulos";
import { USUARIO_PUBLICO } from "@/lib/usuario";

export const dynamic = "force-dynamic";

function daysUntil(date: Date) {
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// Antes, esta tela carregava a tabela de contratos inteira a cada visita,
// algo invisível em dezenas de registros, mas custoso conforme a base cresce.
const PAGE_SIZE = 20;

export default async function ContratosPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; diretoria?: string; page?: string };
}) {
  const page = Math.max(1, Number(searchParams.page) || 1);
  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (searchParams.q) params.set("q", searchParams.q);
    if (searchParams.status) params.set("status", searchParams.status);
    if (searchParams.diretoria) params.set("diretoria", searchParams.diretoria);
    params.set("page", String(targetPage));
    return `?${params.toString()}`;
  };

  const where: Prisma.ContractWhereInput = {};
  const and: Prisma.ContractWhereInput[] = [];
  if (searchParams.status) where.status = searchParams.status;
  if (searchParams.diretoria) {
    and.push({
      OR: [
        { diretoria: searchParams.diretoria as Diretoria },
        { request: { diretoria: searchParams.diretoria as Diretoria } },
      ],
    });
  }
  if (searchParams.q) {
    and.push({
      OR: [
        { supplierName: { contains: searchParams.q, mode: "insensitive" } },
        { supplierTradeName: { contains: searchParams.q, mode: "insensitive" } },
        { supplierCnpj: { contains: searchParams.q, mode: "insensitive" } },
      ],
    });
  }
  if (and.length > 0) where.AND = and;

  const totalCount = await prisma.contract.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const contracts = await prisma.contract.findMany({
    where,
    include: { contractManager: { select: USUARIO_PUBLICO }, request: true },
    orderBy: { renewalDate: "asc" },
    skip: (Math.min(page, totalPages) - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return (
    <AppShell active="/contratos">
      <main className="page" style={{ paddingTop: 28 }}>
        <a href="/solicitacoes" className="back-link">← voltar ao quadro</a>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 12 }}>
          <div>
            <h1 className="page-title" style={{ margin: 0 }}>Gestão de Contratos</h1>
            <p className="page-subtitle">{totalCount} contrato(s) no recorte atual</p>
          </div>
          <ContractImportUpload />
        </div>

        <SearchFilterBar
          searchPlaceholder="Razão social, nome fantasia ou CNPJ..."
          filters={[
            { key: "status", label: "Status", options: [{ value: "ATIVO", label: "Ativo" }, { value: "RENOVACAO_EM_ANDAMENTO", label: "Renovação em andamento" }, { value: "CANCELADO", label: "Cancelado" }] },
            { key: "diretoria", label: "Diretoria", options: [{ value: "CORPORATIVO", label: "Corporativo" }, { value: "REVENUE", label: "Revenue" }, { value: "TECNOLOGIA", label: "Tecnologia" }] },
          ]}
        />

        <TableWrap className="section-gap">
          <TableHeadRow columns="2fr 1fr 1.4fr 1fr 1fr">
            <span>Fornecedor</span>
            <span>Diretoria</span>
            <span>Vigência</span>
            <span>Dias Faltantes</span>
            <span>Status</span>
          </TableHeadRow>
          {contracts.map((c) => {
            const days = daysUntil(c.renewalDate);
            const daysColor = days < 0 ? "var(--danger)" : days <= 30 ? "var(--warning)" : "var(--ink-soft)";
            return (
              <TableRow key={c.id} href={`/contratos/${c.id}`} columns="2fr 1fr 1.4fr 1fr 1fr" style={{ alignItems: "center" }}>
                <span>
                  <span style={{ fontWeight: 700, display: "block" }}>{c.supplierName}</span>
                  {c.supplierTradeName && <span className="text-soft" style={{ fontSize: 11 }}>{c.supplierTradeName}{c.supplierCnpj ? ` · ${c.supplierCnpj}` : ""}</span>}
                </span>
                <span className="text-soft">{c.request?.diretoria ?? c.diretoria ?? "-"}</span>
                <span className="text-soft">{formatDateOnly(c.startDate)} → {formatDateOnly(c.endDate)}</span>
                <span style={{ fontWeight: 700, color: daysColor }}>{days < 0 ? `${Math.abs(days)}d vencido` : `${days}d`}</span>
                <span><Badge variant={CONTRACT_STATUS_BADGE_VARIANT[c.status] ?? "neutral"}>{rotulo(CONTRACT_STATUS_LABEL, c.status)}</Badge></span>
              </TableRow>
            );
          })}
          {contracts.length === 0 && <TableEmpty>Nenhum contrato encontrado com estes filtros. Use "Limpar filtros" acima para ver todos.</TableEmpty>}
        </TableWrap>

        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14, marginTop: 16 }}>
            <a
              href={pageHref(page - 1)}
              className="btn btn-secondary"
              aria-disabled={page <= 1}
              style={page <= 1 ? { pointerEvents: "none", opacity: 0.4 } : undefined}
            >
              ← Anterior
            </a>
            <span style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Página {Math.min(page, totalPages)} de {totalPages}</span>
            <a
              href={pageHref(page + 1)}
              className="btn btn-secondary"
              aria-disabled={page >= totalPages}
              style={page >= totalPages ? { pointerEvents: "none", opacity: 0.4 } : undefined}
            >
              Próxima →
            </a>
          </div>
        )}
      </main>
    </AppShell>
  );
}
