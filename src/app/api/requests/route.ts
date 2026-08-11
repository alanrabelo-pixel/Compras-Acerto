import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { slaDaysForDiretoria } from "@/lib/workflow";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";
import { sendSlackDM } from "@/lib/integrations/slack";

// GET /api/requests — lista solicitações (para o Kanban / listagem)
export async function GET(req: NextRequest) {
  const stage = req.nextUrl.searchParams.get("stage");
  const requests = await prisma.purchaseRequest.findMany({
    where: stage ? { currentStage: stage as never } : undefined,
    include: { requester: true, costCenter: true, approverManager: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(requests);
}

// POST /api/requests — cria uma nova Solicitação de Compra. Campos e ordem
// espelham o formulário Pipefy em produção (ver Nova Solicitação na UI).
export async function POST(req: NextRequest) {
  const body = await req.json();

  const {
    requesterId,
    diretoria,
    costCenterId,
    leadershipPreApproved,
    budgetLineId,
    extraBudget,
    priority,
    demandType,
    category,
    shortDescription,
    longDescription,
    suggestedDeadline,
    indicatedSupplierName,
    indicatedSupplierPhone,
    indicatedSupplierEmail,
    indicatedSupplierWebsite,
    quantity,
    estimatedValue,
    affectedUsers,
  } = body;

  // Validação mínima dos campos obrigatórios (marcados com * no formulário Pipefy).
  // estimatedValue NÃO é obrigatório aqui (paridade consciente com o Pipefy — ver
  // gate na Triagem, que exige o valor antes de calcular alçada/lane).
  //
  // budgetLineId é dispensado quando extraBudget=true ("Orçamento Extra"
  // selecionado no lugar de uma linha real) — nesse caso o formulário exige o
  // anexo de Aprovação Extra-orçamentária em vez de uma linha específica.
  //
  // approverManagerId NÃO vem mais do formulário (pedido do usuário: o gestor
  // aprovador é o dono do centro de custo escolhido, resolvido abaixo via
  // CostCenter.managerId, não uma escolha manual do solicitante).
  const required = {
    requesterId, diretoria, costCenterId, leadershipPreApproved,
    priority, demandType, shortDescription, longDescription,
    suggestedDeadline, quantity,
  };
  for (const [key, value] of Object.entries(required)) {
    if (value === undefined || value === null || value === "") {
      return NextResponse.json({ error: `Campo obrigatório ausente: ${key}` }, { status: 400 });
    }
  }
  if (!budgetLineId && !extraBudget) {
    return NextResponse.json({ error: "Campo obrigatório ausente: budgetLineId (ou selecione Orçamento Extra)" }, { status: 400 });
  }

  const costCenter = await prisma.costCenter.findUnique({ where: { id: costCenterId } });
  if (!costCenter) return NextResponse.json({ error: "Centro de custo não encontrado" }, { status: 404 });
  const approverManagerId = costCenter.managerId;

  const count = await prisma.purchaseRequest.count();
  const code = `PC-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

  const slaDays = slaDaysForDiretoria(diretoria, priority);
  const slaDeadline = new Date();
  slaDeadline.setDate(slaDeadline.getDate() + slaDays);

  const request = await prisma.purchaseRequest.create({
    data: {
      code,
      requesterId,
      diretoria,
      costCenterId,
      leadershipPreApproved,
      approverManagerId,
      budgetLineId,
      priority,
      demandType,
      category: category || undefined,
      shortDescription,
      longDescription,
      suggestedDeadline: new Date(suggestedDeadline),
      indicatedSupplierName,
      indicatedSupplierPhone,
      indicatedSupplierEmail,
      indicatedSupplierWebsite,
      quantity,
      estimatedValue: estimatedValue || undefined,
      affectedUsers,
      currentStage: "SOLICITACAO",
      slaDeadline,
    },
    include: { requester: true, approverManager: true },
  });

  await prisma.stageEvent.create({
    data: { requestId: request.id, toStage: "SOLICITACAO", actorId: requesterId },
  });

  // Comunicação automática — confirmação de recebimento (ver seção 3.1 do doc de referência)
  const { subject, html } = templates.confirmacaoRecebimento(request.requester.name, shortDescription);
  await sendPurchaseEmail({ to: request.requester.email, subject, html, requestId: request.id });

  // Notifica o gestor do centro de custo — é ele quem precisa agir agora, na
  // etapa APROVACAO_GESTOR (não é mais só uma cópia informativa).
  if (request.approverManager) {
    await sendSlackDM({
      slackUserEmail: request.approverManager.email,
      text: `Nova solicitação de compra aguardando sua aprovação: *${shortDescription}* (${code}), por ${request.requester.name}.`,
      requestId: request.id,
    }).catch(() => {
      // Falha de Slack não deve bloquear a criação da solicitação — já registrada em Notification.
    });
  }

  // Move automaticamente para Aprovação do Gestor — só depois da decisão dele
  // é que segue para Triagem (ver PATCH /api/requests/[id]/aprovacao-gestor).
  const updated = await prisma.purchaseRequest.update({
    where: { id: request.id },
    data: { currentStage: "APROVACAO_GESTOR" },
  });
  await prisma.stageEvent.create({
    data: { requestId: request.id, fromStage: "SOLICITACAO", toStage: "APROVACAO_GESTOR" },
  });

  return NextResponse.json(updated, { status: 201 });
}
