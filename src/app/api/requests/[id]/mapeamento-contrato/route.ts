import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { avancarEtapa, notificarAvancoDeEtapa } from "@/lib/etapa";
import { campo } from "@/lib/rotulos";

/**
 * POST /api/requests/[id]/mapeamento-contrato
 *
 * Cadastra o contrato (vigência, cláusulas, gestor responsável) associado a
 * esta solicitação e conclui o fluxo. A base para os alertas de renovação
 * (cron de contract-alerts) é esse cadastro.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: { requester: true, costCenter: true },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "MAPEAMENTO_CONTRATO") {
    return NextResponse.json({ error: "Solicitação não está na etapa de Mapeamento de Contrato" }, { status: 409 });
  }

  const body = await req.json();
  const {
    actorId, supplierId, supplierName, supplierTradeName, supplierCnpj, documentType,
    contractObject, prazo, paymentCondition, startDate, endDate, terminationClause, renewalDate,
    contractManagerId, area, nonCompete, lgpdClause, brandUse, corporateChangeClause,
  } = body;

  const roleError = await requireRole(actorId, ["COMPRADOR"]);
  if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

  const required = { supplierName, startDate, endDate, renewalDate, contractManagerId, area };
  for (const [key, value] of Object.entries(required)) {
    if (!value) return NextResponse.json({ error: `Preencha o campo ${campo(key)} para cadastrar o contrato.` }, { status: 400 });
  }

  const contract = await prisma.contract.create({
    data: {
      requestId: request.id,
      supplierId: supplierId || undefined,
      supplierName,
      supplierTradeName: supplierTradeName || undefined,
      supplierCnpj: supplierCnpj || undefined,
      documentType: documentType || undefined,
      contractObject: contractObject || undefined,
      prazo: prazo || undefined,
      paymentCondition: paymentCondition || undefined,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      terminationClause,
      renewalDate: new Date(renewalDate),
      contractManagerId,
      area,
      costCenter: request.costCenter.name,
      nonCompete: Boolean(nonCompete),
      lgpdClause: Boolean(lgpdClause),
      brandUse: Boolean(brandUse),
      corporateChangeClause: Boolean(corporateChangeClause),
    },
  });

  const avanco = await avancarEtapa({
    requestId: request.id,
    de: "MAPEAMENTO_CONTRATO",
    para: "CONCLUIDO",
    actorId,
    dadosExtras: { status: "CONCLUIDO" },
  });
  if (!avanco.ok) {
    return NextResponse.json({ error: avanco.erro }, { status: avanco.status });
  }

  await notificarAvancoDeEtapa(avanco.solicitacao, "CONCLUIDO");

  return NextResponse.json({ contract, request: avanco.solicitacao }, { status: 201 });
}
