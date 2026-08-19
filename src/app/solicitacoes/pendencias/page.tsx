import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { STAGES } from "@/lib/workflow";
import { loadPendingRequestsForUser } from "@/lib/pendencias";
import type { Stage } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { WhoAmIPicker } from "@/components/WhoAmIPicker";
import { Badge } from "@/components/ui";
import { PRIORITY_BADGE_VARIANT } from "@/lib/badge-variants";
import { formatCurrency } from "@/lib/format";
import { bypassAuthAtivo } from "@/lib/bypass";
import { PRIORITY_LABEL, rotulo } from "@/lib/rotulos";

export const dynamic = "force-dynamic";

function daysSince(date: Date): number {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)));
}

export default async function PendenciasPage({
  searchParams,
}: {
  searchParams: { userId?: string };
}) {
  const bypass = bypassAuthAtivo();
  const session = bypass ? null : await getServerSession(authOptions);
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
  const userId = sessionUserId || searchParams.userId || "";

  if (!userId) {
    return (
      <AppShell active="/solicitacoes/pendencias">
        <main className="page" style={{ paddingTop: 28 }}>
          <h1 className="page-title">Minhas Pendências</h1>
          <p className="page-subtitle">
            Selecione quem você é para ver só as solicitações que estão esperando uma ação sua, sem precisar
            escanear as 15 colunas do quadro completo.
          </p>
          <div style={{ maxWidth: 420, marginTop: 20 }}>
            <WhoAmIPicker />
          </div>
        </main>
      </AppShell>
    );
  }

  const me = await prisma.user.findUnique({ where: { id: userId }, include: { roles: true } });
  if (!me) {
    return (
      <AppShell active="/solicitacoes/pendencias">
        <main className="page" style={{ paddingTop: 28 }}>
          <h1 className="page-title">Minhas Pendências</h1>
          <p className="page-subtitle" style={{ color: "var(--danger)" }}>Usuário não encontrado.</p>
          <a href="/solicitacoes/pendencias" className="btn btn-secondary" style={{ marginTop: 12 }}>
            Selecionar de novo
          </a>
        </main>
      </AppShell>
    );
  }

  const myRoles = me.roles.map((r) => r.role);
  const pending = await loadPendingRequestsForUser(userId, myRoles);

  const byStage = new Map<Stage, typeof pending>();
  for (const r of pending) {
    const list = byStage.get(r.currentStage) ?? [];
    list.push(r);
    byStage.set(r.currentStage, list);
  }
  const stageOrder = Object.values(STAGES).filter((s) => byStage.has(s.stage));

  return (
    <AppShell active="/solicitacoes/pendencias">
      <main className="page" style={{ paddingTop: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "var(--space-3)" }}>
          <div>
            <h1 className="page-title">Minhas Pendências</h1>
            <p className="page-subtitle">
              {me.name} · {pending.length} solicitação(ões) esperando uma ação sua
              {!sessionUserId && (
                <>
                  {" "}· <a href="/solicitacoes/pendencias" style={{ color: "var(--ink-muted)" }}>trocar</a>
                </>
              )}
            </p>
          </div>
          <a href="/solicitacoes" className="btn btn-secondary">Ver quadro completo</a>
        </div>

        {pending.length === 0 && (
          <div className="card" style={{ marginTop: "var(--space-5)", padding: "var(--space-7)", textAlign: "center", color: "var(--ink-muted)" }}>
            Nenhuma solicitação esperando uma ação sua agora.
          </div>
        )}

        <div style={{ display: "grid", gap: "var(--space-6)", marginTop: "var(--space-6)" }}>
          {stageOrder.map((stageDef) => {
            const items = byStage.get(stageDef.stage)!;
            return (
              <section key={stageDef.stage}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
                  <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", margin: 0 }}>{stageDef.label}</h2>
                  <Badge variant="neutral">{items.length}</Badge>
                </div>
                <div style={{ display: "grid", gap: "var(--space-2)" }}>
                  {items.map((r) => {
                    const waiting = daysSince(r.updatedAt);
                    return (
                      <a
                        key={r.id}
                        href={`/solicitacoes/${r.id}`}
                        className="card"
                        style={{ padding: "var(--space-4)", textDecoration: "none", color: "inherit", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)" }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--acerto-green-dark)" }}>{r.code}</span>
                            <Badge variant={PRIORITY_BADGE_VARIANT[r.priority] ?? "neutral"}>{rotulo(PRIORITY_LABEL, r.priority)}</Badge>
                          </div>
                          <p style={{ margin: 0, fontSize: 13, color: "var(--ink)", lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.shortDescription}
                          </p>
                          <p style={{ margin: "var(--space-1) 0 0", fontSize: 11, color: "var(--ink-muted)" }}>
                            {r.requester.name} · {r.costCenter.name}
                            {r.estimatedValue !== null && <> · {formatCurrency(Number(r.estimatedValue))}</>}
                          </p>
                        </div>
                        <span style={{ fontSize: 11, color: "var(--ink-muted)", flex: "none", whiteSpace: "nowrap" }}>
                          {waiting === 0 ? "hoje" : `há ${waiting} dia${waiting > 1 ? "s" : ""}`}
                        </span>
                      </a>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </AppShell>
  );
}
