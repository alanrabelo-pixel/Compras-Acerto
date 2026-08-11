import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { CostCenterManagerPicker } from "@/components/CostCenterManagerPicker";
import { CostCenterActiveToggle } from "@/components/CostCenterActiveToggle";
import { CreateCostCenterForm } from "@/components/CreateCostCenterForm";
import { ApprovalLevelPicker } from "@/components/ApprovalLevelPicker";
import { SearchFilterBar } from "@/components/SearchFilterBar";

export const dynamic = "force-dynamic";

const LEVEL_LABEL: Record<number, string> = {
  1: "Nível 1 — até R$ 50 mil",
  2: "Nível 2 — até R$ 500 mil",
  3: "Nível 3 — acima de R$ 500 mil",
};

export default async function CentrosDeCustoPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string };
}) {
  const where: Prisma.CostCenterWhereInput = {};
  if (searchParams.status === "inativo") where.active = false;
  else if (searchParams.status === "ativo") where.active = true;
  if (searchParams.q) where.name = { contains: searchParams.q, mode: "insensitive" };

  const costCenters = await prisma.costCenter.findMany({
    where,
    include: { managers: true, _count: { select: { requests: true } } },
    orderBy: { name: "asc" },
  });

  const levelRows = await prisma.approvalLevelApprover.findMany({ include: { user: true } });

  return (
    <AppShell active="/admin/centros-de-custo">
      <main className="page" style={{ paddingTop: 28 }}>
        <h1 className="page-title">Centros de Custo</h1>
        <p className="page-subtitle">
          Cada centro de custo tem um ou mais gestores que aprovam automaticamente as solicitações de compra assim
          que o formulário é enviado, antes do comprador atuar (etapa "Aprovação do Gestor") — qualquer um deles pode
          decidir, reduzindo a necessidade de ajuste manual quando um titular está ausente. Trocar os gestores aqui
          também atualiza as solicitações que já estão paradas nessa etapa aguardando decisão. Prefira desativar um
          centro de custo a renomeá-lo ou excluí-lo — preserva o histórico das solicitações já vinculadas a ele.
        </p>

        <CreateCostCenterForm />

        <div className="section-gap">
          <SearchFilterBar
            searchPlaceholder="Nome do centro de custo..."
            filters={[
              { key: "status", label: "Status", options: [{ value: "ativo", label: "Ativo" }, { value: "inativo", label: "Inativo" }] },
            ]}
          />
        </div>

        <div className="table-wrap section-gap">
          <div className="table-head-row" style={{ gridTemplateColumns: "1.8fr 2fr 0.8fr 0.7fr" }}>
            <span>Centro de Custo</span>
            <span>Gestor(es) aprovador(es)</span>
            <span>Solicitações</span>
            <span>Status</span>
          </div>
          {costCenters.map((cc) => (
            <div key={cc.id} className="table-row" style={{ gridTemplateColumns: "1.8fr 2fr 0.8fr 0.7fr", alignItems: "center" }}>
              <span style={{ fontWeight: 600 }}>{cc.name}</span>
              <span><CostCenterManagerPicker costCenterId={cc.id} initialManagerIds={cc.managers.map((m) => m.id)} /></span>
              <span className="text-soft">{cc._count.requests}</span>
              <span><CostCenterActiveToggle costCenterId={cc.id} active={cc.active} /></span>
            </div>
          ))}
          {costCenters.length === 0 && (
            <p style={{ padding: 20, fontSize: 12.5, color: "var(--ink-muted)" }}>Nenhum centro de custo encontrado neste recorte.</p>
          )}
        </div>

        <h2 className="page-title" style={{ fontSize: 18, marginTop: 32 }}>Alçadas de Aprovação</h2>
        <p className="page-subtitle">
          Aprovador(es) padrão de cada alçada de valor, atribuído(s) automaticamente ao criar a Aprovação na etapa
          "Aprovação" (depois de Cotação/Mapa de Cotação) — mais de um é permitido, qualquer um pode decidir.
        </p>
        <div className="table-wrap section-gap">
          <div className="table-head-row" style={{ gridTemplateColumns: "1.6fr 2fr" }}>
            <span>Alçada</span>
            <span>Aprovador(es)</span>
          </div>
          {[1, 2, 3].map((level) => (
            <div key={level} className="table-row" style={{ gridTemplateColumns: "1.6fr 2fr", alignItems: "center" }}>
              <span style={{ fontWeight: 600 }}>{LEVEL_LABEL[level]}</span>
              <span>
                <ApprovalLevelPicker level={level} initialApproverIds={levelRows.filter((r) => r.level === level).map((r) => r.userId)} />
              </span>
            </div>
          ))}
        </div>
      </main>
    </AppShell>
  );
}
