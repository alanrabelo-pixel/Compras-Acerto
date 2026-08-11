import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  approvalLevel,
  canPersonifyApprover,
  nextAfterAprovacao,
  APPROVAL_ESCALATION_BUSINESS_DAYS,
} from "@/lib/workflow";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";
import { sendSlackDM } from "@/lib/integrations/slack";
import { requireRole } from "@/lib/rbac";

/**
 * POST /api/requests/[id]/aprovacao
 *
 * Cria o registro de aprovação na alçada correta (Nível 1/2/3, renumerado na
 * revisão v1.1) e define o prazo (dueAt) para escalonamento automático.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const request = await prisma.purchaseRequest.findUnique({ where: { id: params.id } });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "APROVACAO") {
    return NextResponse.json({ error: "Solicitação não está na etapa de Aprovação" }, { status: 409 });
  }

  const body = await req.json();

  const level = approvalLevel(Number(request.estimatedValue));

  // Aprovador padrão da alçada (ApprovalLevelApprover, ver
  // /admin/centros-de-custo) — quando configurado, é usado automaticamente
  // (mais de um é permitido; o primeiro em ordem alfabética vira o
  // atribuído desta Aprovação específica). Sem nenhum configurado, cai no
  // fallback antigo (escolha manual pelo comprador via body.approverId).
  const levelPool = await prisma.approvalLevelApprover.findMany({ where: { level }, include: { user: true } });
  levelPool.sort((a, b) => a.user.name.localeCompare(b.user.name));
  const approverId: string | undefined = levelPool[0]?.userId ?? body.approverId;
  if (!approverId) {
    return NextResponse.json(
      { error: `Nenhum aprovador configurado para o Nível ${level} — configure em Administração → Centros de Custo, ou informe um aprovador manualmente.` },
      { status: 422 }
    );
  }

  // requireSelf: false — approverId aqui é uma ATRIBUIÇÃO (o comprador está
  // roteando a solicitação para um aprovador específico da alçada), não
  // necessariamente quem está logado clicando "Criar". Só o papel do alvo
  // (APROVADOR) é validado, sem exigir que a sessão seja essa mesma pessoa.
  const roleError = await requireRole(approverId, ["APROVADOR"], { requireSelf: false });
  if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

  // Revisão v1.1: declaração de conflito de interesse é obrigatória antes da
  // Aprovação (ver ConflictOfInterestDeclaration no schema). Bloqueia se ainda
  // não foi declarada, ou se foi declarada COM conflito (exige reatribuição).
  const declaration = await prisma.conflictOfInterestDeclaration.findFirst({
    where: { requestId: request.id },
    orderBy: { createdAt: "desc" },
  });
  if (!declaration) {
    return NextResponse.json(
      { error: "Declaração de conflito de interesse ainda não foi registrada para esta solicitação." },
      { status: 422 }
    );
  }
  if (declaration.hasConflict) {
    return NextResponse.json(
      { error: "Há conflito de interesse declarado — reatribua solicitante/comprador/aprovador antes de prosseguir." },
      { status: 422 }
    );
  }

  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + APPROVAL_ESCALATION_BUSINESS_DAYS);

  const approval = await prisma.approval.create({
    data: { requestId: request.id, level, approverId, dueAt },
  });

  return NextResponse.json(approval, { status: 201 });
}

/**
 * PATCH /api/requests/[id]/aprovacao
 *
 * Decisão do aprovador (ou personificação controlada pelo comprador — revisão
 * v1.1: só permitida até o Nível 1 / R$ 50 mil).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { approvalId, decision, justification, personifiedBy } = body;

  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: { requester: true },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });

  const approval = await prisma.approval.findUnique({ where: { id: approvalId } });
  if (!approval || approval.requestId !== request.id) {
    return NextResponse.json({ error: "Aprovação não encontrada para esta solicitação" }, { status: 404 });
  }

  if (personifiedBy) {
    const roleError = await requireRole(personifiedBy, ["COMPRADOR"]);
    if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

    // Pedido do usuário: o Administrador do sistema pode personificar o
    // aprovador "a qualquer momento, sempre que julgar necessário" — sem o
    // teto de alçada que existe para a personificação normal do comprador
    // (só até o Nível 1).
    const personifierRoles = await prisma.userRole.findMany({ where: { userId: personifiedBy } });
    const personifierIsAdmin = personifierRoles.some((r) => r.role === "ADMIN");

    if (!personifierIsAdmin && !canPersonifyApprover(Number(request.estimatedValue))) {
      return NextResponse.json(
        { error: "Personificação de aprovador só é permitida até o Nível 1 (R$ 50 mil). Este valor exige decisão do aprovador real." },
        { status: 422 }
      );
    }
    if (!justification) {
      return NextResponse.json({ error: "Justificativa é obrigatória ao personificar um aprovador." }, { status: 422 });
    }
  }

  await prisma.approval.update({
    where: { id: approvalId },
    data: { decision, justification, personifiedBy: personifiedBy ?? null, decidedAt: new Date() },
  });

  // Se personificado, notifica o aprovador real (transparência — não substitui a auditoria)
  if (personifiedBy) {
    const approver = await prisma.user.findUnique({ where: { id: approval.approverId } });
    if (approver) {
      await sendSlackDM({
        slackUserEmail: approver.email,
        text: `A solicitação ${request.code} foi ${decision === "APROVADO" ? "aprovada" : "reprovada"} em seu nome pelo comprador, por urgência/ausência. Justificativa: ${justification}`,
        requestId: request.id,
      }).catch(() => {});
    }
  }

  if (decision === "REPROVADO") {
    const nextStage = nextAfterAprovacao({ approved: false, needsContract: Boolean(request.needsContract) });
    await prisma.purchaseRequest.update({
      where: { id: request.id },
      data: { currentStage: nextStage, status: "CANCELADO", cancelReason: justification },
    });
    await prisma.stageEvent.create({
      data: { requestId: request.id, fromStage: "APROVACAO", toStage: nextStage, comment: justification },
    });
    const { subject, html } = templates.reprovado(request.requester.name, request.shortDescription, justification ?? "não informado");
    await sendPurchaseEmail({ to: request.requester.email, subject, html, requestId: request.id });
    return NextResponse.json({ status: "REPROVADO" });
  }

  const nextStage = nextAfterAprovacao({ approved: true, needsContract: Boolean(request.needsContract) });
  const updated = await prisma.purchaseRequest.update({
    where: { id: request.id },
    data: { currentStage: nextStage },
  });
  await prisma.stageEvent.create({
    data: { requestId: request.id, fromStage: "APROVACAO", toStage: nextStage },
  });
  const { subject, html } = templates.aprovado(request.requester.name, request.shortDescription);
  await sendPurchaseEmail({ to: request.requester.email, subject, html, requestId: request.id });

  return NextResponse.json(updated);
}
