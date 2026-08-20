import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { CostCenterManagerPicker } from "@/components/CostCenterManagerPicker";
import { CostCenterActiveToggle } from "@/components/CostCenterActiveToggle";
import { CreateCostCenterForm } from "@/components/CreateCostCenterForm";
import { ApprovalLevelPicker } from "@/components/ApprovalLevelPicker";
import { ApproverCostCentersPicker } from "@/components/ApproverCostCentersPicker";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { TableWrap, TableHeadRow, TableRow, TableEmpty, Tabs } from "@/components/ui";
import { USUARIO_PUBLICO, USUARIO_RESUMIDO } from "@/lib/usuario";

export const dynamic = "force-dynamic";

const LEVEL_LABEL: Record<number, string> = {
  1: "Nível 1: até R$ 50 mil",
  2: "Nível 2: até R$ 500 mil",
  3: "Nível 3: acima de R$ 500 mil",
};

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
          Cada centro de custo tem um ou mais gestores que aprovam automaticamente as solicitações de compra assim
          que o formulário é enviado, antes do comprador atuar (etapa "Aprovação do Gestor"). Qualquer um deles pode
          decidir, reduzindo a necessidade de ajuste manual quando um titular está ausente. Trocar os gestores aqui
          também atualiza as solicitações que já estão paradas nessa etapa aguardando decisão. Prefira desativar um
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
              {costCenters.length === 0 && <TableEmpty>Nenhum centro de custo encontrado com estes filtros. Use "Limpar filtros" acima para ver todos.</TableEmpty>}
            </TableWrap>
          </div>

          <div className="section-gap">
            <p className="page-subtitle" style={{ marginBottom: 14 }}>
              Aprovador(es) padrão de cada alçada de valor, atribuído(s) automaticamente ao criar a Aprovação na etapa
              "Aprovação" (depois de Cotação/Mapa de Cotação). Mais de um é permitido, e qualquer um pode decidir.
            </p>
            <TableWrap>
              <TableHeadRow columns="1.6fr 2fr">
                <span>Alçada</span>
                <span>Aprovador(es)</span>
              </TableHeadRow>
              {[1, 2, 3].map((level) => (
                <TableRow key={level} columns="1.6fr 2fr" style={{ alignItems: "center" }}>
                  <span style={{ fontWeight: 600 }}>{LEVEL_LABEL[level]}</span>
                  <span>
                    <ApprovalLevelPicker level={level} initialApproverIds={levelRows.filter((r) => r.level === level).map((r) => r.userId)} />
                  </span>
                </TableRow>
              ))}
            </TableWrap>
          </div>

          <div className="section-gap">
            <p className="page-subtitle" style={{ marginBottom: 14 }}>
              Visão inversa da tabela de Centros de Custo: escolha, por pessoa, quais centros de custo ela pode
              aprovar. Quem não estiver marcado para um centro de custo não vê a solicitação em "Minhas Pendências"
              quando ela chega na etapa "Aprovação do Gestor".
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
