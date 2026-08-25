import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function SemAcessoPage() {
  const session = await getServerSession(authOptions);

  return (
    <main className="page-narrow" style={{ paddingTop: 80, textAlign: "center" }}>
      <div className="card" style={{ padding: 32 }}>
        <h1 className="page-title">Sem acesso a esta área</h1>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 10, lineHeight: 1.6 }}>
          {session?.user?.email ? <>Você está autenticado como <strong>{session.user.email}</strong>, mas ainda</> : "Você"} não tem
          acesso ao quadro de Solicitações, Contratos ou Dashboards. Peça a um administrador para liberar seu acesso em
          &quot;/admin/acessos&quot;.
        </p>
        <p style={{ fontSize: 13, marginTop: 16 }}>
          <a href="/solicitacoes/nova" style={{ color: "var(--acerto-green-dark)", fontWeight: 600, textDecoration: "none" }}>
            Você ainda pode abrir uma Nova Solicitação de Compra →
          </a>
        </p>
        <p style={{ marginTop: 20 }}>
          <a href="/api/auth/signout" style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Sair da conta</a>
        </p>
      </div>
    </main>
  );
}
