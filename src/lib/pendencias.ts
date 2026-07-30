import { prisma } from "@/lib/db";
import { budgetExceptionLevel, budgetExceptionApproverRole } from "@/lib/workflow";
import type { RoleName, Stage } from "@prisma/client";

/**
 * Papel que precisa agir em cada etapa — complemento ao Kanban completo,
 * filtrado por quem de fato está esperando uma ação da pessoa. Compartilhado
 * entre solicitacoes/pendencias/page.tsx (lista completa) e home-data.ts (só
 * a contagem, para o sino de notificações da Home). APROVACAO e
 * VALIDACAO_ORCAMENTARIA (exceção) são tratadas à parte abaixo, porque
 * dependem de um registro específico (Approval/BudgetException), não só do
 * papel.
 */
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

export async function loadPendingRequestsForUser(userId: string, myRoles: RoleName[]) {
  const isAdmin = myRoles.includes("ADMIN");

  const requests = await prisma.purchaseRequest.findMany({
    where: { currentStage: { notIn: ["SOLICITACAO", "CONCLUIDO", "CANCELADO"] } },
    include: { requester: true, costCenter: true, approvals: true, budgetException: true },
    orderBy: { updatedAt: "asc" },
  });

  return requests.filter((r) => {
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
}
