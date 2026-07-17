import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const LINKS = [
  { href: "/solicitacoes", label: "Solicitações" },
  { href: "/contratos", label: "Contratos" },
  { href: "/dashboards", label: "Dashboards" },
];

const LOCAL_BYPASS_USER = { name: "Modo local (sem SSO)", email: "local@acerto.com.br", roles: ["ADMIN"] };

export async function TopNav({ active }: { active?: string }) {
  const bypass = process.env.LOCAL_BYPASS_AUTH === "true";
  const session = bypass ? null : await getServerSession(authOptions);
  const user = bypass
    ? LOCAL_BYPASS_USER
    : (session?.user as { name?: string | null; email?: string | null; roles?: string[] } | undefined);
  const isAdmin = user?.roles?.includes("ADMIN");

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="topbar-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/acerto-logo.svg" alt="Acerto" className="topbar-logo" />
          <span className="topbar-divider" />
          <span className="topbar-title">Compras</span>
        </Link>
        <nav className="topbar-nav">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={`topbar-link${active === link.href ? " active" : ""}`}>
              {link.label}
            </Link>
          ))}
          {isAdmin && (
            <Link href="/admin/acessos" className={`topbar-link${active === "/admin/acessos" ? " active" : ""}`}>
              Acessos
            </Link>
          )}
          <Link href="/solicitacoes/nova" className="btn btn-primary" style={{ marginLeft: 8 }}>
            + Nova Solicitação
          </Link>
          {user && (
            <span style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 12, paddingLeft: 12, borderLeft: "1px solid var(--border)" }}>
              <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{user.name ?? user.email}</span>
              <a href="/api/auth/signout" style={{ fontSize: 11.5, color: "var(--ink-muted)", textDecoration: "none" }}>Sair</a>
            </span>
          )}
        </nav>
      </div>
    </header>
  );
}
