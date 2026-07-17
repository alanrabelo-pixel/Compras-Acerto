import { prisma } from "@/lib/db";
import { TopNav } from "@/components/TopNav";
import { AccessToggle } from "@/components/AccessToggle";

export const dynamic = "force-dynamic";

export default async function AcessosPage() {
  const users = await prisma.user.findMany({
    where: { active: true },
    include: { roles: true },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <TopNav active="/admin/acessos" />
      <main className="page" style={{ paddingTop: 28 }}>
        <h1 className="page-title">Controle de acesso</h1>
        <p className="page-subtitle">
          Quem pode ver o quadro de Solicitações, Contratos e Dashboards. Qualquer pessoa autenticada com e-mail
          @acerto.com.br já pode abrir uma Nova Solicitação, independente desta lista.
        </p>

        <div className="table-wrap section-gap">
          <div className="table-head-row" style={{ gridTemplateColumns: "2fr 2fr 2fr 1fr" }}>
            <span>Nome</span>
            <span>E-mail</span>
            <span>Papéis</span>
            <span>Acesso ao quadro</span>
          </div>
          {users.map((u) => (
            <div key={u.id} className="table-row" style={{ gridTemplateColumns: "2fr 2fr 2fr 1fr", alignItems: "center" }}>
              <span style={{ fontWeight: 600 }}>{u.name}</span>
              <span className="text-soft">{u.email}</span>
              <span className="text-soft">{u.roles.map((r) => r.role).join(", ") || "—"}</span>
              <span><AccessToggle userId={u.id} initialValue={u.canViewBoard} /></span>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
