import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";

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
          <SignOutButton
            style={{ appearance: "none", background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer", fontSize: 12.5, color: "var(--ink-muted)" }}
          >
            Sair da conta
          </SignOutButton>
        </p>
      </div>
    </main>
  );
}
