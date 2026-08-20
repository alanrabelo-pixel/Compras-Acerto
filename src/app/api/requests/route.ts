import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { slaDaysForDiretoria } from "@/lib/workflow";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";
import { sendSlackDM } from "@/lib/integrations/slack";
import { proximoCodigo } from "@/lib/codigo";
import { campo } from "@/lib/rotulos";
import { USUARIO_PUBLICO } from "@/lib/usuario";
import { atorDaSessao, exigirQuadro } from "@/lib/acesso";

// GET /api/requests: lista solicitações (para o Kanban / listagem)
export async function GET(req: NextRequest) {
  // Listagem ampla, sem recorte por registro: devolve a carteira inteira da
  // empresa. Não há filtro por solicitante nesta rota (só `stage`), então não
  // existe recorte "só as minhas" a preservar aqui; quem não vê o quadro é
  // barrado. A tela /solicitacoes/minhas não passa por esta rota, ela consulta
  // o Prisma direto no servidor com where.requesterId.
  const barrado = await exigirQuadro("o quadro de solicitações");
  if (barrado) return barrado;

  const stage = req.nextUrl.searchParams.get("stage");
  const requests = await prisma.purchaseRequest.findMany({
    where: stage ? { currentStage: stage as never } : undefined,
    include: {
      requester: { select: USUARIO_PUBLICO },
      costCenter: true,
      approverManager: { select: USUARIO_PUBLICO },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(requests);
}

// POST /api/requests: cria uma nova Solicitação de Compra (ver Nova
// Solicitação na UI).
export async function POST(req: NextRequest) {
  const body = await req.json();

  const {
    requesterId,
    diretoria,
    costCenterId,
    leadershipPreApproved,
    budgetLineText,
    extraBudget,
    priority,
    demandType,
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

  // Quem está abrindo a solicitação: a SESSÃO manda, o corpo só entra quando
  // não há sessão nenhuma (desenvolvimento local com LOCAL_BYPASS_AUTH, onde o
  // formulário roda sem SSO e escolhe o solicitante no UserPicker).
  //
  // Antes, requesterId vinha do corpo e nunca era comparado com a sessão: com
  // um POST direto dava para abrir solicitação em nome de outra pessoa, e a
  // confirmação de recebimento (sendPurchaseEmail abaixo) chegava na caixa
  // dela, com a descrição da compra que ela não pediu. O StageEvent de
  // abertura também registrava a pessoa errada como autora.
  //
  // Nenhum papel é exigido aqui de propósito: abrir solicitação é de qualquer
  // colaborador, o recorte é só de identidade.
  const ator = await atorDaSessao();
  const solicitanteId = ator?.id ?? requesterId;

  // Validação mínima dos campos obrigatórios (marcados com * no formulário).
  // estimatedValue NÃO é obrigatório aqui, de propósito: ver
  // gate na Triagem, que exige o valor antes de calcular alçada/lane.
  //
  // budgetLineText é dispensado quando extraBudget=true ("Orçamento Extra"
  // selecionado no lugar de uma linha); nesse caso o formulário exige o
  // anexo de Aprovação Extra-orçamentária em vez do texto da linha.
  //
  // approverManagerId NÃO vem mais do formulário (pedido do usuário: o gestor
  // aprovador é o dono do centro de custo escolhido, resolvido abaixo via
  // CostCenter.managerId, não uma escolha manual do solicitante).
  const required = {
    requesterId: solicitanteId, diretoria, costCenterId, leadershipPreApproved,
    priority, demandType, shortDescription, longDescription,
    suggestedDeadline, quantity,
  };
  for (const [key, value] of Object.entries(required)) {
    if (value === undefined || value === null || value === "") {
      return NextResponse.json({ error: `Preencha o campo ${campo(key)} antes de enviar a solicitação.` }, { status: 400 });
    }
  }
  if (!budgetLineText && !extraBudget) {
    return NextResponse.json({ error: "Informe a Linha do Orçamento, ou marque Orçamento Extra se não houver uma." }, { status: 400 });
  }

  const costCenter = await prisma.costCenter.findUnique({
    where: { id: costCenterId },
    include: { managers: { select: USUARIO_PUBLICO, orderBy: { name: "asc" } } },
  });
  if (!costCenter) return NextResponse.json({ error: "Centro de custo não encontrado" }, { status: 404 });
  // Mais de um gestor pode estar configurado (pedido do usuário): o primeiro
  // (ordem alfabética) fica como approverManagerId "principal" (FK única em
  // PurchaseRequest), mas TODOS são notificados e qualquer um pode decidir
  // (ver PATCH /api/requests/[id]/aprovacao-gestor).
  const approverManagerId = costCenter.managers[0]?.id ?? null;

  const code = await proximoCodigo("PC");

  const slaDays = slaDaysForDiretoria(diretoria, priority);
  const slaDeadline = new Date();
  slaDeadline.setDate(slaDeadline.getDate() + slaDays);

  const request = await prisma.purchaseRequest.create({
    data: {
      code,
      requesterId: solicitanteId,
      diretoria,
      costCenterId,
      leadershipPreApproved,
      approverManagerId,
      budgetLineText,
      // Era lido da requisição e descartado: a solicitação ficava sem linha de
      // orçamento e sem nenhum registro de que era extra-orçamentária, e a
      // Validação Orçamentária perdia como saber que precisa exigir o
      // comprovante de aprovação do FP&A.
      extraBudget: Boolean(extraBudget),
      priority,
      demandType,
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
    include: {
      requester: { select: USUARIO_PUBLICO },
      approverManager: { select: USUARIO_PUBLICO },
    },
  });

  await prisma.stageEvent.create({
    data: { requestId: request.id, toStage: "SOLICITACAO", actorId: solicitanteId },
  });

  // Comunicação automática: confirmação de recebimento (ver seção 3.1 do doc de referência)
  const { subject, html } = templates.confirmacaoRecebimento(request.requester.name, shortDescription);
  await sendPurchaseEmail({ to: request.requester.email, subject, html, requestId: request.id });

  // Notifica TODOS os gestores do centro de custo (não só o principal), pois é
  // qualquer um deles que pode agir agora, na etapa APROVACAO_GESTOR (não é
  // mais só uma cópia informativa).
  await Promise.all(
    costCenter.managers.map((manager) =>
      sendSlackDM({
        slackUserEmail: manager.email,
        text: `Nova solicitação de compra aguardando sua aprovação: *${shortDescription}* (${code}), por ${request.requester.name}.`,
        requestId: request.id,
      }).catch(() => {
        // Falha de Slack não deve bloquear a criação da solicitação, já registrada em Notification.
      })
    )
  );

  // Move automaticamente para Aprovação do Gestor: só depois da decisão dele
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
