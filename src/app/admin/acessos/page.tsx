import { prisma } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { RoleAccessToggles } from "@/components/RoleAccessToggles";
import { UserActiveToggle } from "@/components/UserActiveToggle";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { BulkUserImportForm } from "@/components/BulkUserImportForm";
import { TableWrap, TableHeadRow, TableRow, TableEmpty } from "@/components/ui";
import { ACCESS_ROLES, STAGE_ROLES } from "@/lib/roles";
import type { Prisma, RoleName } from "@prisma/client";

export const dynamic = "force-dynamic";




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
          Uma pessoa pode ter mais de um papel ao mesmo tempo, e eles vêm em dois grupos.{" "}
          <strong>Acesso</strong> decide o que ela enxerga: Admin (tudo), Compras (opera o fluxo, Contratos e
          Dashboards), Solicitante (só as próprias solicitações), Aprovador (decide aprovações e vê o quadro) e
          Controladoria (decide exceções orçamentárias). <strong>Etapa</strong> decide onde ela pode agir:
          Jurídico, Privacidade, Fiscal, Tesouraria, Coordenação e Gerente F&amp;NC atuam cada um na sua etapa do
          fluxo, e sozinhos não dão acesso ao quadro geral.
          Qualquer pessoa @acerto.com.br já pode abrir uma Nova Solicitação, independente desta lista.
          Desativar uma pessoa bloqueia o acesso (inclusive login), mas preserva todo o histórico dela no sistema.
        </p>

        <BulkUserImportForm />

        <SearchFilterBar
          searchPlaceholder="Nome ou e-mail..."
          filters={[
            {
              key: "tipo",
              label: "Tipo de acesso",
              options: ACCESS_ROLES.map((r) => ({ value: r.role, label: r.label })),
            },
            {
              key: "papel",
              label: "Papel de etapa",
              options: STAGE_ROLES.map((r) => ({ value: r.role, label: r.label })),
            },
            {
              key: "status",
              label: "Status",
              options: [{ value: "ativo", label: "Ativo" }, { value: "inativo", label: "Inativo" }],
            },
          ]}
        />

        <TableWrap className="section-gap">
          <TableHeadRow columns="1.2fr 1.5fr 3.4fr 0.8fr 0.8fr">
            <span>Nome</span>
            <span>E-mail</span>
            <span>Acessos e papéis</span>
            <span>Status</span>
            <span>Origem</span>
          </TableHeadRow>
          {users.map((u) => {
            const papeis = u.roles.map((r) => r.role);
            return (
              <TableRow key={u.id} columns="1.2fr 1.5fr 3.4fr 0.8fr 0.8fr" style={{ alignItems: "center" }}>
                <span style={{ fontWeight: 600 }}>{u.name}</span>
                <span className="text-soft">{u.email}</span>
                <span><RoleAccessToggles userId={u.id} initialRoles={papeis} /></span>
                <span><UserActiveToggle userId={u.id} active={u.active} /></span>
                <span className="badge badge-info" style={{ fontSize: 10.5 }}>{u.googleId ? "SSO" : "Manual"}</span>
              </TableRow>
            );
          })}
          {users.length === 0 && <TableEmpty>Nenhuma pessoa encontrada com estes filtros. Use &quot;Limpar filtros&quot; acima para ver todas.</TableEmpty>}
        </TableWrap>
      </main>
    </AppShell>
  );
}
