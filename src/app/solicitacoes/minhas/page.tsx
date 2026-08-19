import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { STAGES } from "@/lib/workflow";
import { AppShell } from "@/components/AppShell";
import { WhoAmIPicker } from "@/components/WhoAmIPicker";
import { Badge, TableWrap, TableHeadRow, TableRow } from "@/components/ui";
import { PRIORITY_BADGE_VARIANT } from "@/lib/badge-variants";
import { formatDateTime } from "@/lib/format";
import { bypassAuthAtivo } from "@/lib/bypass";
import { PRIORITY_LABEL, rotulo } from "@/lib/rotulos";

export const dynamic = "force-dynamic";

/**
 * Recorte de quem só tem o papel Solicitante (sem acesso ao quadro geral;
 * ver src/lib/roles.ts). Mostra só as solicitações que a própria pessoa
 * abriu, sem as 15 colunas/campos de gestão do quadro completo. Sem link
 * para o detalhe (/solicitacoes/[id]): aquela tela mistura os formulários de
 * ação de cada etapa (Triagem, Validação Orçamentária, etc.), pensados para
 * quem compra/aprova/controla, não para quem só solicitou. Em vez de expor
 * uma tela de gestão incompleta pra esse público, o status já aparece aqui.
 */
export default async function MinhasSolicitacoesPage({
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
      <AppShell active="/solicitacoes/minhas">
        <main className="page" style={{ paddingTop: 28 }}>
          <h1 className="page-title">Minhas Solicitações</h1>
          <p className="page-subtitle">Selecione quem você é para ver as solicitações de compra que você abriu.</p>
          <div style={{ maxWidth: 420, marginTop: 20 }}>
            <WhoAmIPicker targetPath="/solicitacoes/minhas" buttonLabel="Ver minhas solicitações" />
          </div>
        </main>
      </AppShell>
    );
  }

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) {
    return (
      <AppShell active="/solicitacoes/minhas">
        <main className="page" style={{ paddingTop: 28 }}>
          <h1 className="page-title">Minhas Solicitações</h1>
          <p className="page-subtitle" style={{ color: "var(--danger)" }}>Usuário não encontrado.</p>
          <a href="/solicitacoes/minhas" className="btn btn-secondary" style={{ marginTop: 12 }}>
            Selecionar de novo
          </a>
        </main>
      </AppShell>
    );
  }

  const myRequests = await prisma.purchaseRequest.findMany({
    where: { requesterId: userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, code: true, shortDescription: true, currentStage: true, priority: true, updatedAt: true },
  });

  return (
    <AppShell active="/solicitacoes/minhas">
      <main className="page" style={{ paddingTop: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h1 className="page-title">Minhas Solicitações</h1>
            <p className="page-subtitle">
              {me.name} · {myRequests.length} solicitação(ões)
              {!sessionUserId && (
                <>
                  {" "}· <a href="/solicitacoes/minhas" style={{ color: "var(--ink-muted)" }}>trocar</a>
                </>
              )}
            </p>
          </div>
          <a href="/solicitacoes/nova" className="btn btn-primary">+ Nova Solicitação</a>
        </div>

        {myRequests.length === 0 ? (
          <div className="card" style={{ marginTop: 20, padding: 28, textAlign: "center", color: "var(--ink-muted)" }}>
            Você ainda não abriu nenhuma solicitação de compra.
          </div>
        ) : (
          <div style={{ marginTop: 20 }}>
            <TableWrap>
              <TableHeadRow columns="0.7fr 2.2fr 0.7fr 1.1fr 0.9fr">
                <span>Código</span>
                <span>Descrição</span>
                <span>Prioridade</span>
                <span>Status</span>
                <span>Atualizado</span>
              </TableHeadRow>
              {myRequests.map((r) => (
                <TableRow key={r.id} columns="0.7fr 2.2fr 0.7fr 1.1fr 0.9fr" style={{ alignItems: "center" }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--acerto-green-dark)" }}>{r.code}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.shortDescription}</span>
                  <Badge variant={PRIORITY_BADGE_VARIANT[r.priority] ?? "neutral"}>{rotulo(PRIORITY_LABEL, r.priority)}</Badge>
                  <Badge variant="neutral">{STAGES[r.currentStage].label}</Badge>
                  <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>{formatDateTime(r.updatedAt)}</span>
                </TableRow>
              ))}
            </TableWrap>
          </div>
        )}
      </main>
    </AppShell>
  );
}
