import { prisma } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { CostCenterManagerPicker } from "@/components/CostCenterManagerPicker";
import { CostCenterActiveToggle } from "@/components/CostCenterActiveToggle";

export const dynamic = "force-dynamic";

export default async function CentrosDeCustoPage() {
  const costCenters = await prisma.costCenter.findMany({
    include: { manager: true, _count: { select: { requests: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <AppShell active="/admin/centros-de-custo">
      <main className="page" style={{ paddingTop: 28 }}>
        <h1 className="page-title">Centros de Custo</h1>
        <p className="page-subtitle">
          Cada centro de custo tem um gestor que aprova automaticamente as solicitações de compra assim que o
          formulário é enviado, antes do comprador atuar (etapa "Aprovação do Gestor"). Trocar o gestor aqui também
          atualiza as solicitações que já estão paradas nessa etapa aguardando decisão. Prefira desativar um centro
          de custo a renomeá-lo ou excluí-lo — preserva o histórico das solicitações já vinculadas a ele.
        </p>

        <div className="table-wrap section-gap">
          <div className="table-head-row" style={{ gridTemplateColumns: "1.8fr 2fr 0.8fr 0.7fr" }}>
            <span>Centro de Custo</span>
            <span>Gestor aprovador</span>
            <span>Solicitações</span>
            <span>Status</span>
          </div>
          {costCenters.map((cc) => (
            <div key={cc.id} className="table-row" style={{ gridTemplateColumns: "1.8fr 2fr 0.8fr 0.7fr", alignItems: "center" }}>
              <span style={{ fontWeight: 600 }}>{cc.name}</span>
              <span><CostCenterManagerPicker costCenterId={cc.id} initialManagerId={cc.managerId ?? ""} /></span>
              <span className="text-soft">{cc._count.requests}</span>
              <span><CostCenterActiveToggle costCenterId={cc.id} active={cc.active} /></span>
            </div>
          ))}
          {costCenters.length === 0 && (
            <p style={{ padding: 20, fontSize: 12.5, color: "var(--ink-muted)" }}>Nenhum centro de custo cadastrado.</p>
          )}
        </div>
      </main>
    </AppShell>
  );
}
