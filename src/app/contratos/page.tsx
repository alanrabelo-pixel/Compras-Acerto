import { prisma } from "@/lib/db";
import { formatDateOnly } from "@/lib/format";
import { TopNav } from "@/components/TopNav";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { ContractImportUpload } from "@/components/ContractImportUpload";
import type { Prisma, Diretoria } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  ATIVO: "badge-green",
  RENOVACAO_EM_ANDAMENTO: "badge-warning",
  CANCELADO: "badge-danger",
};

function daysUntil(date: Date) {
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default async function ContratosPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; diretoria?: string };
}) {
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

  const contracts = await prisma.contract.findMany({
    where,
    include: { contractManager: true, request: true },
    orderBy: { renewalDate: "asc" },
  });

  return (
    <>
      <TopNav active="/contratos" />
      <main className="page" style={{ paddingTop: 28 }}>
        <a href="/solicitacoes" className="back-link">← voltar ao quadro</a>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 12 }}>
          <div>
            <h1 className="page-title" style={{ margin: 0 }}>Gestão de Contratos</h1>
            <p className="page-subtitle">{contracts.length} contrato(s) no recorte atual</p>
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

        <div className="table-wrap section-gap">
          <div className="table-head-row" style={{ gridTemplateColumns: "2fr 1fr 1.4fr 1fr 1fr" }}>
            <span>Fornecedor</span>
            <span>Diretoria</span>
            <span>Vigência</span>
            <span>Dias Faltantes</span>
            <span>Status</span>
          </div>
          {contracts.map((c) => {
            const days = daysUntil(c.renewalDate);
            const daysColor = days < 0 ? "var(--danger)" : days <= 30 ? "var(--warning)" : "var(--ink-soft)";
            return (
              <a key={c.id} href={`/contratos/${c.id}`} className="table-row" style={{ gridTemplateColumns: "2fr 1fr 1.4fr 1fr 1fr", alignItems: "center" }}>
                <span>
                  <span style={{ fontWeight: 700, display: "block" }}>{c.supplierName}</span>
                  {c.supplierTradeName && <span className="text-soft" style={{ fontSize: 11 }}>{c.supplierTradeName}{c.supplierCnpj ? ` · ${c.supplierCnpj}` : ""}</span>}
                </span>
                <span className="text-soft">{c.request?.diretoria ?? c.diretoria ?? "—"}</span>
                <span className="text-soft">{formatDateOnly(c.startDate)} → {formatDateOnly(c.endDate)}</span>
                <span style={{ fontWeight: 700, color: daysColor }}>{days < 0 ? `${Math.abs(days)}d vencido` : `${days}d`}</span>
                <span><span className={`badge ${STATUS_BADGE[c.status] ?? "badge-neutral"}`}>{c.status}</span></span>
              </a>
            );
          })}
          {contracts.length === 0 && (
            <p style={{ padding: 20, fontSize: 12.5, color: "var(--ink-muted)" }}>Nenhum contrato encontrado neste recorte.</p>
          )}
        </div>
      </main>
    </>
  );
}
