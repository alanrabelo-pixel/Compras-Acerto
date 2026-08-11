import { prisma } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { RoleAccessToggles } from "@/components/RoleAccessToggles";
import { UserActiveToggle } from "@/components/UserActiveToggle";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import type { Prisma, RoleName } from "@prisma/client";

export const dynamic = "force-dynamic";

const MANAGED_ROLES = ["ADMIN", "COMPRADOR", "SOLICITANTE", "APROVADOR", "CONTROLADORIA"];
const OTHER_ROLES = ["TESOURARIA", "FISCAL", "JURIDICO", "PRIVACIDADE", "COORDENACAO", "GERENTE_FNC"];

export default async function AcessosPage({
  searchParams,
}: {
  searchParams: { q?: string; tipo?: string; papel?: string; status?: string };
}) {
  const where: Prisma.UserWhereInput = {};
  where.active = searchParams.status === "inativo" ? false : searchParams.status === "ativo" ? true : undefined;
  if (searchParams.tipo) where.roles = { some: { role: searchParams.tipo as RoleName } };
  if (searchParams.papel) {
    where.AND = [{ roles: { some: { role: searchParams.papel as RoleName } } }];
  }
  if (searchParams.q) {
    where.OR = [
      { name: { contains: searchParams.q, mode: "insensitive" } },
      { email: { contains: searchParams.q, mode: "insensitive" } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    include: { roles: true },
    orderBy: { name: "asc" },
  });

  return (
    <AppShell active="/admin/acessos">
      <main className="page" style={{ paddingTop: 28 }}>
        <h1 className="page-title">Controle de acesso</h1>
        <p className="page-subtitle">
          Cinco tipos de acesso, uma pessoa pode ter mais de um ao mesmo tempo: <strong>Admin</strong> (acesso total),{" "}
          <strong>Compras</strong> (opera o fluxo, Contratos e Dashboards), <strong>Solicitante</strong> (só abre
          solicitações, sem ver o quadro geral), <strong>Aprovador</strong> (decide aprovações, vê o quadro e
          Dashboards) e <strong>Controladoria</strong> (decide exceções orçamentárias, vê Contratos e Dashboards).
          Qualquer pessoa @acerto.com.br já pode abrir uma Nova Solicitação, independente desta lista.
          Desativar uma pessoa bloqueia o acesso (inclusive login), mas preserva todo o histórico dela no sistema.
        </p>

        <SearchFilterBar
          searchPlaceholder="Nome ou e-mail..."
          filters={[
            {
              key: "tipo",
              label: "Tipo de acesso",
              options: [
                { value: "ADMIN", label: "Admin" },
                { value: "COMPRADOR", label: "Compras" },
                { value: "SOLICITANTE", label: "Solicitante" },
                { value: "APROVADOR", label: "Aprovador" },
                { value: "CONTROLADORIA", label: "Controladoria" },
              ],
            },
            {
              key: "papel",
              label: "Outro papel (etapa)",
              options: OTHER_ROLES.map((r) => ({ value: r, label: r })),
            },
            {
              key: "status",
              label: "Status",
              options: [{ value: "ativo", label: "Ativo" }, { value: "inativo", label: "Inativo" }],
            },
          ]}
        />

        <div className="table-wrap section-gap">
          <div className="table-head-row" style={{ gridTemplateColumns: "1.3fr 1.7fr 2.3fr 1.2fr 0.8fr 0.8fr" }}>
            <span>Nome</span>
            <span>E-mail</span>
            <span>Tipos de acesso</span>
            <span>Outros papéis (etapa)</span>
            <span>Status</span>
            <span>Origem</span>
          </div>
          {users.map((u) => {
            const managed = u.roles.filter((r) => MANAGED_ROLES.includes(r.role)).map((r) => r.role);
            const other = u.roles.filter((r) => !MANAGED_ROLES.includes(r.role)).map((r) => r.role);
            return (
              <div key={u.id} className="table-row" style={{ gridTemplateColumns: "1.3fr 1.7fr 2.3fr 1.2fr 0.8fr 0.8fr", alignItems: "center" }}>
                <span style={{ fontWeight: 600 }}>{u.name}</span>
                <span className="text-soft">{u.email}</span>
                <span><RoleAccessToggles userId={u.id} initialRoles={managed} /></span>
                <span className="text-soft" style={{ fontSize: 11.5 }}>{other.join(", ") || "—"}</span>
                <span><UserActiveToggle userId={u.id} active={u.active} /></span>
                <span className="badge badge-info" style={{ fontSize: 10.5 }}>{u.googleId ? "SSO" : "Manual"}</span>
              </div>
            );
          })}
          {users.length === 0 && (
            <p style={{ padding: 20, fontSize: 12.5, color: "var(--ink-muted)" }}>Nenhuma pessoa encontrada neste recorte.</p>
          )}
        </div>
      </main>
    </AppShell>
  );
}
