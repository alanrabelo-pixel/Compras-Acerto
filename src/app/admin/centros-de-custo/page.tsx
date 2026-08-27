import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { CostCenterManagerPicker } from "@/components/CostCenterManagerPicker";
import { CostCenterActiveToggle } from "@/components/CostCenterActiveToggle";
import { CreateCostCenterForm } from "@/components/CreateCostCenterForm";
import { CostCenterImportForm } from "@/components/CostCenterImportForm";
import { AlcadasAdmin } from "@/components/AlcadasAdmin";
import { ApproverCostCentersPicker } from "@/components/ApproverCostCentersPicker";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { TableWrap, TableHeadRow, TableRow, TableEmpty, Tabs } from "@/components/ui";
import { USUARIO_PUBLICO, USUARIO_RESUMIDO } from "@/lib/usuario";
import { todasAsFaixas } from "@/lib/alcadas";

export const dynamic = "force-dynamic";

export default async function CentrosDeCustoPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; gestor?: string; solicitacoes?: string };
}) {
  const where: Prisma.CostCenterWhereInput = {};
  if (searchParams.status === "inativo") where.active = false;
  else if (searchParams.status === "ativo") where.active = true;
  if (searchParams.q) where.name = { contains: searchParams.q, mode: "insensitive" };
  if (searchParams.gestor === "sem") where.managers = { none: {} };
  else if (searchParams.gestor) where.managers = { some: { id: searchParams.gestor } };
  if (searchParams.solicitacoes === "com") where.requests = { some: {} };
  else if (searchParams.solicitacoes === "sem") where.requests = { none: {} };

  const costCenters = await prisma.costCenter.findMany({
    where,
    include: { managers: { select: USUARIO_PUBLICO }, _count: { select: { requests: true } } },
    orderBy: { name: "asc" },
  });

  const levelRows = await prisma.approvalLevelApprover.findMany({ include: { user: { select: USUARIO_PUBLICO } } });
  const faixasDeAlcada = await todasAsFaixas();
  const aprovadoresPorFaixa = levelRows.reduce<Record<number, string[]>>((mapa, linha) => {
    (mapa[linha.level] ??= []).push(linha.userId);
    return mapa;
  }, {});

  const approvers = await prisma.user.findMany({
    where: { roles: { some: { role: "APROVADOR" } } },
    select: { ...USUARIO_RESUMIDO, costCentersManaged: true },
    orderBy: { name: "asc" },
  });

  return (
    <AppShell active="/admin/centros-de-custo">
      <main className="page" style={{ paddingTop: 28 }}>
        <h1 className="page-title">Centros de Custo</h1>
        <p className="page-subtitle">
          Cada centro de custo tem um ou mais gestores, avisados automaticamente quando uma solicitação é aberta no
          centro de custo deles. Desde 21/08/2026 esse aviso é informativo: a solicitação segue direto para a Triagem
          e o gestor não decide mais na entrada. O controle de gasto sem orçamento ficou na exceção orçamentária da
          Validação Orçamentária, e o controle por valor, na etapa Aprovação. Prefira desativar um
          centro de custo a renomeá-lo ou excluí-lo, pois isso preserva o histórico das solicitações já vinculadas a ele.
        </p>

        <Tabs
          tabs={[
            { id: "centros", label: "Centros de Custo" },
            { id: "alcadas", label: "Alçadas de Aprovação" },
            { id: "aprovador", label: "Por Gestor" },
          ]}
        >
          <div className="section-gap">
            <CostCenterImportForm />
            <SearchFilterBar
              searchPlaceholder="Nome do centro de custo..."
              filters={[
                { key: "status", label: "Status", options: [{ value: "ativo", label: "Ativo" }, { value: "inativo", label: "Inativo" }] },
                {
                  key: "gestor", label: "Gestor",
                  options: [
                    { value: "sem", label: "Sem gestor definido" },
                    ...approvers.map((u) => ({ value: u.id, label: u.name })),
                  ],
                },
                { key: "solicitacoes", label: "Solicitações", options: [{ value: "com", label: "Com solicitações" }, { value: "sem", label: "Sem solicitações" }] },
              ]}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", margin: "10px 0" }}>
              <CreateCostCenterForm />
            </div>
            <TableWrap>
              <TableHeadRow columns="1.8fr 2fr 0.8fr 1.1fr">
                <span>Centro de Custo</span>
                <span>Gestor(es) do centro de custo</span>
                <span>Solicitações</span>
                <span>Status</span>
              </TableHeadRow>
              {costCenters.map((cc) => (
                <TableRow key={cc.id} columns="1.8fr 2fr 0.8fr 1.1fr" style={{ alignItems: "center" }}>
                  <span style={{ fontWeight: 600 }}>{cc.name}</span>
                  <span><CostCenterManagerPicker costCenterId={cc.id} initialManagerIds={cc.managers.map((m) => m.id)} /></span>
                  <span className="text-soft">{cc._count.requests}</span>
                  <span><CostCenterActiveToggle costCenterId={cc.id} active={cc.active} /></span>
                </TableRow>
              ))}
              {costCenters.length === 0 && <TableEmpty>Nenhum centro de custo encontrado com estes filtros. Use &quot;Limpar filtros&quot; acima para ver todos.</TableEmpty>}
            </TableWrap>
          </div>

          <AlcadasAdmin faixas={faixasDeAlcada} aprovadoresPorFaixa={aprovadoresPorFaixa} />

          <div className="section-gap">
            <p className="page-subtitle" style={{ marginBottom: 14 }}>
              Visão inversa da tabela de Centros de Custo: escolha, por pessoa, quais centros de custo ela
              acompanha. Quem não estiver marcado para um centro de custo não recebe o aviso de solicitação nova
              aberta nele.
            </p>
            <TableWrap>
              <TableHeadRow columns="1.6fr 2.4fr">
                <span>Gestor</span>
                <span>Centros de custo que gerencia</span>
              </TableHeadRow>
              {approvers.map((u) => (
                <TableRow key={u.id} columns="1.6fr 2.4fr" style={{ alignItems: "center" }}>
                  <span style={{ fontWeight: 600 }}>{u.name} <span className="text-soft" style={{ fontWeight: 400 }}>({u.email})</span></span>
                  <span>
                    <ApproverCostCentersPicker userId={u.id} initialCostCenterIds={u.costCentersManaged.map((cc) => cc.id)} />
                  </span>
                </TableRow>
              ))}
              {approvers.length === 0 && <TableEmpty>Ninguém com o papel Aprovador ainda.</TableEmpty>}
            </TableWrap>
          </div>
        </Tabs>
      </main>
    </AppShell>
  );
}
