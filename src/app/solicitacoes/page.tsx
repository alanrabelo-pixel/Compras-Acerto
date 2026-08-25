import { prisma } from "@/lib/db";
import { STAGES, etapaVisivelNoQuadro } from "@/lib/workflow";
import type { Prisma, Stage, Diretoria, DemandType, Priority } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { Badge, TableWrap, TableHeadRow, TableRow, TableEmpty } from "@/components/ui";
import { PRIORITY_BADGE_VARIANT } from "@/lib/badge-variants";
import { LayoutGrid, List } from "lucide-react";
import { PRIORITY_LABEL, DEMAND_TYPE_LABEL, rotulo } from "@/lib/rotulos";
import { USUARIO_PUBLICO } from "@/lib/usuario";

export const dynamic = "force-dynamic";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

// Paginação: antes, tanto o Kanban quanto a Lista carregavam a base inteira
// a cada visita (invisível em dezenas de registros, custoso em milhares).
// Kanban: mostra até KANBAN_CAP_PER_STAGE cards por coluna (a contagem do
// badge continua exata, via groupBy) com link "ver todas" para a Lista já
// filtrada por aquela etapa quando há mais. Lista: paginação de verdade
// (page/pageSize) com Anterior/Próxima.
const PAGE_SIZE = 20;
const KANBAN_CAP_PER_STAGE = 12;

export default async function SolicitacoesPage({
  searchParams,
}: {
  searchParams: {
    q?: string; diretoria?: string; costCenterId?: string; priority?: string; demandType?: string;
    view?: string; stage?: string; page?: string;
  };
}) {
  const viewMode = searchParams.view === "lista" ? "lista" : "kanban";
  const page = Math.max(1, Number(searchParams.page) || 1);
  const viewHref = (view: string) => {
    const params = new URLSearchParams();
    if (searchParams.q) params.set("q", searchParams.q);
    if (searchParams.diretoria) params.set("diretoria", searchParams.diretoria);
    if (searchParams.costCenterId) params.set("costCenterId", searchParams.costCenterId);
    if (searchParams.priority) params.set("priority", searchParams.priority);
    if (searchParams.demandType) params.set("demandType", searchParams.demandType);
    params.set("view", view);
    return `?${params.toString()}`;
  };
  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (searchParams.q) params.set("q", searchParams.q);
    if (searchParams.diretoria) params.set("diretoria", searchParams.diretoria);
    if (searchParams.costCenterId) params.set("costCenterId", searchParams.costCenterId);
    if (searchParams.priority) params.set("priority", searchParams.priority);
    if (searchParams.demandType) params.set("demandType", searchParams.demandType);
    params.set("view", "lista");
    params.set("page", String(targetPage));
    return `?${params.toString()}`;
  };
  const stageViewAllHref = (stage: Stage) => {
    const params = new URLSearchParams();
    if (searchParams.diretoria) params.set("diretoria", searchParams.diretoria);
    if (searchParams.costCenterId) params.set("costCenterId", searchParams.costCenterId);
    if (searchParams.priority) params.set("priority", searchParams.priority);
    if (searchParams.demandType) params.set("demandType", searchParams.demandType);
    params.set("view", "lista");
    params.set("stage", stage);
    return `?${params.toString()}`;
  };

  // Validada contra STAGES antes de virar filtro: um valor que não existe no
  // enum ia direto para o `where` e zerava o quadro, sem erro e sem dizer por
  // quê. Link velho ou URL digitada à mão passavam a mostrar "nada aqui", que
  // se confunde com não haver solicitação. Inválida agora é ignorada.
  const etapaFiltrada = searchParams.stage && searchParams.stage in STAGES ? (searchParams.stage as Stage) : null;

  const where: Prisma.PurchaseRequestWhereInput = {};
  if (searchParams.diretoria) where.diretoria = searchParams.diretoria as Diretoria;
  if (searchParams.costCenterId) where.costCenterId = searchParams.costCenterId;
  if (searchParams.priority) where.priority = searchParams.priority as Priority;
  if (searchParams.demandType) where.demandType = searchParams.demandType as DemandType;
  if (etapaFiltrada) where.currentStage = etapaFiltrada;
  if (searchParams.q) {
    where.OR = [
      { code: { contains: searchParams.q, mode: "insensitive" } },
      { shortDescription: { contains: searchParams.q, mode: "insensitive" } },
      { requester: { name: { contains: searchParams.q, mode: "insensitive" } } },
    ];
  }

  const include = { requester: { select: USUARIO_PUBLICO }, costCenter: true } as const;

  // Etapas que viram coluna. UMA lista, usada tanto na consulta quanto na
  // renderização: eram duas, calculadas separadamente, e foi essa duplicação
  // que escondeu o defeito abaixo.
  //
  // O FILTRO POR ETAPA ERA IGNORADO NO KANBAN. Cada coluna consulta com
  // `{ ...where, currentStage: stage }`, e esse `currentStage` sobrescrevia o
  // que veio do filtro: pedir ?stage=COTACAO devolvia o quadro inteiro, sem
  // erro e sem aviso. Na Lista sempre funcionou, porque lá o `where` é usado
  // direto. Restringir as colunas resolve os dois lados: a consulta passa a
  // rodar só para a etapa pedida, e a tela mostra só aquela coluna, que é o
  // que a URL promete.
  const stageOrder = (Object.keys(STAGES) as Stage[])
    .filter(etapaVisivelNoQuadro)
    .filter((s) => etapaFiltrada === null || s === etapaFiltrada);

  const [totalCount, costCenters] = await Promise.all([
    prisma.purchaseRequest.count({ where }),
    prisma.costCenter.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  let requests: Prisma.PurchaseRequestGetPayload<{ include: typeof include }>[] = [];
  let stageCountMap = new Map<Stage, number>();
  let totalPages = 1;

  if (viewMode === "lista") {
    totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    requests = await prisma.purchaseRequest.findMany({
      where, include, orderBy: { createdAt: "desc" },
      skip: (Math.min(page, totalPages) - 1) * PAGE_SIZE, take: PAGE_SIZE,
    });
  } else {
    const [counts, perStage] = await Promise.all([
      prisma.purchaseRequest.groupBy({ by: ["currentStage"], where, _count: { _all: true } }),
      Promise.all(
        stageOrder.map((stage) =>
          prisma.purchaseRequest.findMany({
            where: { ...where, currentStage: stage }, include, orderBy: { createdAt: "desc" }, take: KANBAN_CAP_PER_STAGE,
          })
        )
      ),
    ]);
    stageCountMap = new Map(counts.map((c) => [c.currentStage, c._count._all]));
    requests = perStage.flat();
  }

  const byStage = new Map<Stage, typeof requests>();
  for (const r of requests) {
    const list = byStage.get(r.currentStage) ?? [];
    list.push(r);
    byStage.set(r.currentStage, list);
  }

  return (
    <AppShell active="/solicitacoes">
      <main className="page" style={{ paddingTop: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "var(--space-3)" }}>
          <div>
            <h1 className="page-title">Solicitações de Compra</h1>
            <p className="page-subtitle">{totalCount} solicitação(ões) no recorte atual</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <div className="view-toggle">
              <a href={viewHref("kanban")} className={viewMode === "kanban" ? "active" : ""}>
                <LayoutGrid size={14} strokeWidth={1.75} aria-hidden /> Kanban
              </a>
              <a href={viewHref("lista")} className={viewMode === "lista" ? "active" : ""}>
                <List size={14} strokeWidth={1.75} aria-hidden /> Lista
              </a>
            </div>
            <a href="/solicitacoes/pendencias" className="btn btn-secondary">Minhas Pendências →</a>
          </div>
        </div>

        <SearchFilterBar
          searchPlaceholder="Código, descrição ou solicitante..."
          filters={[
            { key: "diretoria", label: "Diretoria", options: [{ value: "CORPORATIVO", label: "Corporativo" }, { value: "REVENUE", label: "Revenue" }, { value: "TECNOLOGIA", label: "Tecnologia" }] },
            { key: "costCenterId", label: "Centro de Custo", options: costCenters.map((c) => ({ value: c.id, label: c.name })) },
            { key: "priority", label: "Prioridade", options: [{ value: "CRITICA", label: "Crítica" }, { value: "ALTA", label: "Alta" }, { value: "MEDIA", label: "Média" }, { value: "BAIXA", label: "Baixa" }] },
            { key: "demandType", label: "Tipo de Demanda", options: Object.entries(DEMAND_TYPE_LABEL).map(([value, label]) => ({ value, label })) },
          ]}
        />

        {viewMode === "kanban" ? (
        <div style={{ display: "flex", gap: "var(--space-4)", overflowX: "auto", marginTop: "var(--space-6)", paddingBottom: "var(--space-3)" }}>
          {stageOrder
            .map((s) => STAGES[s])
            .map((stageDef) => {
              const items = byStage.get(stageDef.stage) ?? [];
              const stageTotal = stageCountMap.get(stageDef.stage) ?? items.length;
              return (
                <div key={stageDef.stage} style={{ minWidth: 268, flex: "0 0 268px", background: "var(--surface-muted)", borderRadius: 14, padding: "var(--space-3)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px var(--space-1) var(--space-3)" }}>
                    <h2 style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)", margin: 0 }}>{stageDef.label}</h2>
                    <Badge variant="neutral">{stageTotal}</Badge>
                  </div>
                  <div style={{ display: "grid", gap: "var(--space-2)" }}>
                    {items.map((r) => (
                      <a
                        key={r.id}
                        href={`/solicitacoes/${r.id}`}
                        className="card"
                        style={{ padding: "var(--space-3)", textDecoration: "none", color: "inherit", display: "block" }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--acerto-green-dark)" }}>{r.code}</span>
                          <Badge variant={PRIORITY_BADGE_VARIANT[r.priority] ?? "neutral"}>{rotulo(PRIORITY_LABEL, r.priority)}</Badge>
                        </div>
                        <p style={{ margin: "0 0 var(--space-2)", fontSize: 12.5, color: "var(--ink)", lineHeight: 1.35 }}>{r.shortDescription}</p>
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                          <span
                            style={{
                              width: 18, height: 18, borderRadius: "50%", background: "var(--acerto-green-50)", color: "var(--acerto-green-dark)",
                              fontSize: 8.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flex: "none",
                            }}
                          >
                            {initials(r.requester.name)}
                          </span>
                          <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>{r.requester.name} · {r.costCenter.name}</span>
                        </div>
                      </a>
                    ))}
                    {items.length === 0 && (
                      <p style={{ fontSize: 11, color: "var(--ink-muted)", padding: "var(--space-2) var(--space-1)" }}>Nenhuma solicitação aqui.</p>
                    )}
                    {stageTotal > items.length && (
                      <a href={stageViewAllHref(stageDef.stage)} style={{ fontSize: 11, color: "var(--acerto-green-dark)", fontWeight: 600, textDecoration: "none", padding: "var(--space-1) var(--space-1)" }}>
                        Ver todas ({stageTotal}) →
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
        ) : (
        <TableWrap className="section-gap">
          <TableHeadRow columns="1fr 2.6fr 1.6fr 0.9fr 1.6fr">
            <span>Código</span>
            <span>Descrição</span>
            <span>Etapa</span>
            <span>Prioridade</span>
            <span>Solicitante</span>
          </TableHeadRow>
          {requests.map((r) => (
            <TableRow key={r.id} href={`/solicitacoes/${r.id}`} columns="1fr 2.6fr 1.6fr 0.9fr 1.6fr" style={{ alignItems: "center" }}>
              <span style={{ fontWeight: 700, color: "var(--acerto-green-dark)" }}>{r.code}</span>
              <span className="text-soft">{r.shortDescription}</span>
              <span><Badge variant="neutral">{STAGES[r.currentStage].label}</Badge></span>
              <span><Badge variant={PRIORITY_BADGE_VARIANT[r.priority] ?? "neutral"}>{rotulo(PRIORITY_LABEL, r.priority)}</Badge></span>
              <span className="text-soft">{r.requester.name} · {r.costCenter.name}</span>
            </TableRow>
          ))}
          {requests.length === 0 && <TableEmpty>Nenhuma solicitação encontrada com estes filtros. Use &quot;Limpar filtros&quot; acima para ver todas.</TableEmpty>}
        </TableWrap>
        )}

        {viewMode === "lista" && totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
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
