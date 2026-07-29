import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { STAGES, budgetExceptionLevel, budgetExceptionApproverRole } from "@/lib/workflow";
import type { Stage, RoleName } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { WhoAmIPicker } from "@/components/WhoAmIPicker";

export const dynamic = "force-dynamic";

const PRIORITY_BADGE: Record<string, string> = {
  CRITICA: "badge-danger",
  ALTA: "badge-warning",
  MEDIA: "badge-info",
  BAIXA: "badge-neutral",
};

// Papel que precisa agir em cada etapa (pedido do usuário: complemento ao
// Kanban, filtrado por quem está de fato esperando uma ação da pessoa).
// APROVACAO e VALIDACAO_ORCAMENTARIA (exceção) são tratadas à parte abaixo,
// porque dependem de um registro específico (Approval/BudgetException), não
// só do papel.
const ACTION_ROLES: Partial<Record<Stage, RoleName[]>> = {
  TRIAGEM: ["COMPRADOR"],
  VALIDACAO_ORCAMENTARIA: ["COMPRADOR"],
  DUE_DILIGENCE: ["PRIVACIDADE"],
  COTACAO: ["COMPRADOR"],
  MAPA_COTACAO: ["COMPRADOR"],
  JURIDICO: ["JURIDICO"],
  PEDIDO_COMPRA: ["COMPRADOR"],
  AGUARDANDO_ENTREGA: ["COMPRADOR"],
  MEDICAO: ["COMPRADOR"],
  FISCAL: ["FISCAL"],
  TESOURARIA: ["TESOURARIA"],
  MAPEAMENTO_CONTRATO: ["COMPRADOR"],
};

function daysSince(date: Date): number {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)));
}

export default async function PendenciasPage({
  searchParams,
}: {
  searchParams: { userId?: string };
}) {
  const bypass = process.env.LOCAL_BYPASS_AUTH === "true";
  const session = bypass ? null : await getServerSession(authOptions);
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
  const userId = sessionUserId || searchParams.userId || "";

  if (!userId) {
    return (
      <AppShell active="/solicitacoes/pendencias">
        <main className="page" style={{ paddingTop: 28 }}>
          <h1 className="page-title">Minhas Pendências</h1>
          <p className="page-subtitle">
            Selecione quem você é para ver só as solicitações que estão esperando uma ação sua — sem precisar
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
  const isAdmin = myRoles.includes("ADMIN");

  const requests = await prisma.purchaseRequest.findMany({
    where: { currentStage: { notIn: ["SOLICITACAO", "CONCLUIDO", "CANCELADO"] } },
    include: { requester: true, costCenter: true, approvals: true, budgetException: true },
    orderBy: { updatedAt: "asc" },
  });

  const pending = requests.filter((r) => {
    if (isAdmin) return true; // ADMIN pode agir em qualquer etapa (ver requireRole em rbac.ts)

    if (r.currentStage === "APROVACAO") {
      return r.approvals.some((a) => a.approverId === userId && a.decision === "PENDENTE");
    }

    if (r.currentStage === "VALIDACAO_ORCAMENTARIA") {
      if (myRoles.includes("COMPRADOR")) return true; // decisão "há orçamento?" é sempre do comprador
      if (r.budgetException?.decision === "PENDENTE") {
        const requiredRole = budgetExceptionApproverRole(budgetExceptionLevel(Number(r.estimatedValue ?? 0)));
        return myRoles.includes(requiredRole);
      }
      return false;
    }

    const roles = ACTION_ROLES[r.currentStage];
    return roles ? roles.some((role) => myRoles.includes(role)) : false;
  });

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
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
          <div className="card" style={{ marginTop: 20, padding: 28, textAlign: "center", color: "var(--ink-muted)" }}>
            Nenhuma solicitação esperando uma ação sua agora.
          </div>
        )}

        <div style={{ display: "grid", gap: 26, marginTop: 22 }}>
          {stageOrder.map((stageDef) => {
            const items = byStage.get(stageDef.stage)!;
            return (
              <section key={stageDef.stage}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", margin: 0 }}>{stageDef.label}</h2>
                  <span className="badge badge-neutral">{items.length}</span>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {items.map((r) => {
                    const waiting = daysSince(r.updatedAt);
                    return (
                      <a
                        key={r.id}
                        href={`/solicitacoes/${r.id}`}
                        className="card"
                        style={{ padding: 14, textDecoration: "none", color: "inherit", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--acerto-green-dark)" }}>{r.code}</span>
                            <span className={`badge ${PRIORITY_BADGE[r.priority] ?? "badge-neutral"}`}>{r.priority}</span>
                          </div>
                          <p style={{ margin: 0, fontSize: 13, color: "var(--ink)", lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.shortDescription}
                          </p>
                          <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--ink-muted)" }}>
                            {r.requester.name} · {r.costCenter.name}
                            {r.estimatedValue !== null && <> · R$ {Number(r.estimatedValue).toLocaleString("pt-BR")}</>}
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
