import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  determineLane,
  checkFragmentationRisk,
  approvalLevel,
  nextAfterValidacaoOrcamentaria,
} from "@/lib/workflow";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";
import { avancarEtapa, notificarAvancoDeEtapa } from "@/lib/etapa";
import { requireRole } from "@/lib/rbac";

/**
 * PATCH /api/requests/[id]/triagem
 *
 * Ação do comprador na etapa de Triagem (documento de referência, seção 3.1):
 * avalia se a solicitação está completa, marca needsContract / needsMapping /
 * valueType, e decide se avança para Validação Orçamentária ou devolve ao
 * solicitante para completar informações.
 *
 * Revisão v1.1 aplicada aqui:
 * - Lane: calculada a partir de valor, fornecedor e tipo de demanda.
 * - Anti-fracionamento: soma solicitações do mesmo fornecedor nos últimos 12 meses.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const {
    buyerId,
    action, // "AVANCAR" | "DEVOLVER"
    needsContract,
    needsMapping,
    valueType,
    returnReason,
    supplierApproved, // vem do cadastro de fornecedor, se já houver match por CNPJ/nome
    supplierRiskTier,
    handlesPersonalData,
    priorRequestsValueLast12Months, // calculado no client ou em uma query auxiliar antes de chamar esta rota
    estimatedValue, // preenchido pelo comprador quando a solicitação chegou sem valor estimado (campo opcional)
  } = body;

  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: { requester: true },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "TRIAGEM") {
    return NextResponse.json(
      { error: "Esta solicitação não está na etapa de Triagem. Recarregue a página para ver o estado atual." },
      { status: 409 }
    );
  }

  const roleError = await requireRole(buyerId, ["COMPRADOR"]);
  if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

  if (action === "DEVOLVER") {
    await prisma.comment.create({
      data: { requestId: request.id, authorId: buyerId, body: returnReason ?? "Informações incompletas.", stage: "TRIAGEM" },
    });
    const { subject, html } = templates.atualizacaoEtapa(request.requester.name, request.shortDescription, "Triagem: informações pendentes");
    await sendPurchaseEmail({ to: request.requester.email, subject, html, requestId: request.id });
    return NextResponse.json({ status: "DEVOLVIDO" });
  }

  // Atalho para CANCELAMENTO (pedido do usuário): um cancelamento de
  // contrato/serviço/ferramenta não compra nada, então não faz sentido
  // exigir valor estimado/lane/fracionamento nem passar por Validação
  // Orçamentária, Cotação, Aprovação e Pedido de Compra: vai direto para
  // Jurídico formalizar o distrato/termo de cancelamento.
  if (request.demandType === "CANCELAMENTO") {
    const atalho = await avancarEtapa({
      requestId: request.id,
      de: "TRIAGEM",
      para: "JURIDICO",
      actorId: buyerId,
      comentario: "Cancelamento de Contrato/Serviço/Ferramenta: fluxo simplificado, direto para Jurídico.",
      dadosExtras: { buyerId },
    });
    if (!atalho.ok) {
      return NextResponse.json({ error: atalho.erro }, { status: atalho.status });
    }
    await notificarAvancoDeEtapa(atalho.solicitacao, "JURIDICO");
    return NextResponse.json({ ...atalho.solicitacao, _meta: { skippedToJuridico: true } });
  }

  // Gate: Valor Estimado é opcional na Solicitação, mas o motor de alçadas (determineLane, checkFragmentationRisk,
  // approvalLevel, budgetExceptionLevel) exige um número, e a Triagem é onde
  // isso é resolvido, já que o comprador tem contexto para estimar o valor.
  let resolvedEstimatedValue = request.estimatedValue !== null ? Number(request.estimatedValue) : null;
  if (resolvedEstimatedValue === null) {
    if (estimatedValue === undefined || estimatedValue === null || Number(estimatedValue) <= 0) {
      return NextResponse.json(
        { error: "Esta solicitação foi aberta sem valor estimado. Informe um valor estimado (estimatedValue) para avançar." },
        { status: 422 }
      );
    }
    resolvedEstimatedValue = Number(estimatedValue);
  }

  const lane = determineLane({
    estimatedValue: resolvedEstimatedValue,
    supplierApproved: Boolean(supplierApproved),
    supplierRiskTier: supplierRiskTier ?? "MEDIO",
    demandType: request.demandType,
    handlesPersonalData: Boolean(handlesPersonalData),
  });

  const fragmentation = checkFragmentationRisk({
    newRequestValue: resolvedEstimatedValue,
    priorRequestsValueLast12Months: Number(priorRequestsValueLast12Months ?? 0),
  });

  // Os campos calculados na Triagem (lane, fracionamento, valor resolvido) são
  // gravados na MESMA transação do avanço: antes, uma falha entre o update e o
  // evento deixava a solicitação já em Validação Orçamentária sem registro de
  // como chegou lá.
  const avanco = await avancarEtapa({
    requestId: request.id,
    de: "TRIAGEM",
    para: "VALIDACAO_ORCAMENTARIA",
    actorId: buyerId,
    dadosExtras: {
      buyerId,
      needsContract,
      needsMapping,
      valueType,
      lane,
      estimatedValue: resolvedEstimatedValue,
      fragmentationFlag: fragmentation.flagged,
    },
  });
  if (!avanco.ok) {
    return NextResponse.json({ error: avanco.erro }, { status: avanco.status });
  }
  const updated = avanco.solicitacao;

  if (fragmentation.flagged) {
    await prisma.notification.create({
      data: {
        requestId: request.id,
        channel: "EMAIL",
        recipient: "controladoria@acerto.com.br",
        subject: `Risco de fracionamento: ${request.code}`,
        status: "ENVIADO",
      },
    });
  }

  await notificarAvancoDeEtapa(updated, "VALIDACAO_ORCAMENTARIA");

  return NextResponse.json({
    ...updated,
    _meta: {
      lane,
      fragmentationFlagged: fragmentation.flagged,
      nextApprovalLevelIfNoBudget: approvalLevel(resolvedEstimatedValue),
      hintNextStage: nextAfterValidacaoOrcamentaria({ budgetOk: true, demandType: request.demandType }),
    },
  });
}
