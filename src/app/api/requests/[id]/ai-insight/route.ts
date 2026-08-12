import { NextRequest, NextResponse } from "next/server";
import { RoleName } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { decryptSecret } from "@/lib/crypto";
import { approvalLevel } from "@/lib/workflow";
import {
  generateInsight,
  buildTriagemPrompt,
  buildDueDiligencePrompt,
  buildNegotiationPrompt,
  buildLegalReviewPrompt,
  buildContractReviewPrompt,
  buildApprovalSummaryPrompt,
} from "@/lib/integrations/ai";

/**
 * GET /api/requests/[id]/ai-insight — histórico de sugestões de IA já
 * geradas para esta solicitação, em qualquer etapa (mais recente primeiro),
 * para dar continuidade entre etapas (ex: Cotação -> Mapa de Cotação).
 *
 * POST /api/requests/[id]/ai-insight — gera uma nova análise via IA
 * (Anthropic e Gemini em paralelo — pedido do usuário) a partir do contexto
 * atual da etapa em que a solicitação está. `draft` carrega campos que a
 * pessoa está preenchendo no formulário mas ainda não salvou (ex:
 * observações do Jurídico, dados do contrato no Mapeamento), para a IA
 * reagir ao que está sendo digitado, não só ao que já está persistido.
 */
const STAGE_ROLE: Partial<Record<string, RoleName[]>> = {
  TRIAGEM: ["COMPRADOR"],
  COTACAO: ["COMPRADOR"],
  MAPA_COTACAO: ["COMPRADOR"],
  DUE_DILIGENCE: ["PRIVACIDADE"],
  JURIDICO: ["JURIDICO"],
  MAPEAMENTO_CONTRATO: ["COMPRADOR"],
  APROVACAO: ["APROVADOR"],
};

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const insights = await prisma.aiInsight.findMany({
    where: { requestId: params.id },
    include: { requestedBy: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(insights);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: { quotes: true, costCenter: true, requester: true, conflictDeclarations: true, approvals: true },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });

  const allowedRoles = STAGE_ROLE[request.currentStage];
  if (!allowedRoles) {
    return NextResponse.json(
      { error: `Assistente de IA não está disponível na etapa atual (${request.currentStage}).` },
      { status: 409 }
    );
  }

  const body = await req.json();
  const { actorId, draft } = body as { actorId: string; draft?: Record<string, unknown> };
  const d = draft ?? {};

  const roleError = await requireRole(actorId, allowedRoles);
  if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

  // Pedido do usuário: usa a chave pessoal de quem está atuando, não uma
  // chave única do app — ver /api/users/[id]/ai-keys e src/lib/integrations/ai.ts.
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { anthropicApiKey: true, geminiApiKey: true },
  });

  const estimatedValue = request.estimatedValue !== null ? Number(request.estimatedValue) : null;

  let prompt: string;
  switch (request.currentStage) {
    case "TRIAGEM":
      prompt = buildTriagemPrompt({
        demandType: request.demandType,
        shortDescription: request.shortDescription,
        longDescription: request.longDescription,
        estimatedValue,
        quantity: request.quantity,
        priority: request.priority,
        diretoria: request.diretoria,
        indicatedSupplierName: request.indicatedSupplierName,
        leadershipPreApproved: request.leadershipPreApproved,
        supplierApproved: typeof d.supplierApproved === "boolean" ? d.supplierApproved : undefined,
        supplierRiskTier: typeof d.supplierRiskTier === "string" ? d.supplierRiskTier : undefined,
        handlesPersonalData: typeof d.handlesPersonalData === "boolean" ? d.handlesPersonalData : undefined,
      });
      break;
    case "DUE_DILIGENCE":
      prompt = buildDueDiligencePrompt({
        demandType: request.demandType,
        shortDescription: request.shortDescription,
        longDescription: request.longDescription,
        estimatedValue,
        indicatedSupplierName: request.indicatedSupplierName,
        affectedUsers: request.affectedUsers,
      });
      break;
    case "COTACAO":
    case "MAPA_COTACAO":
      prompt = buildNegotiationPrompt({
        stage: request.currentStage,
        demandType: request.demandType,
        shortDescription: request.shortDescription,
        longDescription: request.longDescription,
        estimatedValue,
        quantity: request.quantity,
        priority: request.priority,
        diretoria: request.diretoria,
        lane: request.lane,
        indicatedSupplierName: request.indicatedSupplierName,
        quotes: request.quotes.map((q) => ({
          supplierName: q.supplierName,
          initialValue: Number(q.initialValue),
          negotiatedValue: Number(q.negotiatedValue),
          paymentCondition: q.paymentCondition,
        })),
      });
      break;
    case "JURIDICO":
      prompt = buildLegalReviewPrompt({
        demandType: request.demandType,
        shortDescription: request.shortDescription,
        longDescription: request.longDescription,
        estimatedValue,
        needsContract: request.needsContract,
        minutaUrl: typeof d.minutaUrl === "string" ? d.minutaUrl : null,
        observations: typeof d.observations === "string" ? d.observations : null,
      });
      break;
    case "MAPEAMENTO_CONTRATO":
      prompt = buildContractReviewPrompt({
        supplierName: typeof d.supplierName === "string" ? d.supplierName : "",
        contractObject: typeof d.contractObject === "string" ? d.contractObject : null,
        prazo: typeof d.prazo === "string" ? d.prazo : null,
        paymentCondition: typeof d.paymentCondition === "string" ? d.paymentCondition : null,
        terminationClause: typeof d.terminationClause === "string" ? d.terminationClause : null,
        nonCompete: Boolean(d.nonCompete),
        lgpdClause: Boolean(d.lgpdClause),
        brandUse: Boolean(d.brandUse),
        corporateChangeClause: Boolean(d.corporateChangeClause),
        estimatedValue,
      });
      break;
    case "APROVACAO": {
      const winning = request.quotes.find((q) => q.selected) ?? null;
      const latestConflict = request.conflictDeclarations[0];
      const pendingApproval = request.approvals.find((a) => a.decision === "PENDENTE");
      prompt = buildApprovalSummaryPrompt({
        demandType: request.demandType,
        shortDescription: request.shortDescription,
        longDescription: request.longDescription,
        estimatedValue,
        diretoria: request.diretoria,
        costCenterName: request.costCenter.name,
        requesterName: request.requester.name,
        lane: request.lane,
        needsContract: request.needsContract,
        winningQuote: winning
          ? {
              supplierName: winning.supplierName,
              initialValue: Number(winning.initialValue),
              negotiatedValue: Number(winning.negotiatedValue),
              paymentCondition: winning.paymentCondition,
            }
          : null,
        fragmentationFlag: request.fragmentationFlag,
        hasConflictDeclared: Boolean(latestConflict?.hasConflict),
        isPersonified: Boolean(pendingApproval?.personifiedBy),
        approvalLevel: estimatedValue !== null ? approvalLevel(estimatedValue) : 0,
      });
      break;
    }
    default:
      return NextResponse.json({ error: "Etapa não suportada pelo assistente de IA." }, { status: 409 });
  }

  const { anthropic, gemini } = await generateInsight(prompt, {
    anthropicApiKey: actor?.anthropicApiKey ? decryptSecret(actor.anthropicApiKey) : null,
    geminiApiKey: actor?.geminiApiKey ? decryptSecret(actor.geminiApiKey) : null,
  });

  const insight = await prisma.aiInsight.create({
    data: {
      requestId: request.id,
      stage: request.currentStage,
      requestedById: actorId,
      anthropicPayload: anthropic.payload ? JSON.stringify(anthropic.payload) : null,
      anthropicModel: anthropic.model,
      anthropicError: anthropic.error,
      geminiPayload: gemini.payload ? JSON.stringify(gemini.payload) : null,
      geminiModel: gemini.model,
      geminiError: gemini.error,
    },
    include: { requestedBy: true },
  });

  const bothFailed = !anthropic.payload && !gemini.payload;
  return NextResponse.json(insight, { status: bothFailed ? 502 : 201 });
}
