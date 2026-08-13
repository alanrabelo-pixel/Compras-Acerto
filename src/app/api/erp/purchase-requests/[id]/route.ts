import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireErpAuth } from "@/lib/erpAuth";

/**
 * GET /api/erp/purchase-requests/[id]
 *
 * Payload completo de uma solicitação CONCLUIDA para o futuro ERP criar seu
 * próprio lançamento (nota/pedido/doc contábil) — fornecedor, valores,
 * centro de custo, linha de orçamento, itens do Pedido de Compra, dados
 * fiscais e de pagamento, e o PDF do Pedido de Compra.
 *
 * Autenticação: header Authorization: Bearer <ERP_API_KEY>.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = requireErpAuth(req);
  if (authError) return authError;

  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: {
      requester: true,
      costCenter: true,
      budgetLine: true,
      purchaseOrder: { include: { items: { orderBy: { order: "asc" } } } },
      payment: true,
      fiscalDocument: true,
      contract: true,
    },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "CONCLUIDO") {
    return NextResponse.json(
      { error: `Solicitação ainda não está Concluída (etapa atual: ${request.currentStage}) — só é exposta ao ERP após a conclusão do fluxo.` },
      { status: 409 }
    );
  }

  const po = request.purchaseOrder;

  return NextResponse.json({
    id: request.id,
    code: request.code,
    diretoria: request.diretoria,
    costCenter: request.costCenter.name,
    budgetLine: request.budgetLine
      ? { code: request.budgetLine.externalCode, description: request.budgetLine.description }
      : request.budgetLineText ? { code: null, description: request.budgetLineText } : null,
    requester: { name: request.requester.name, email: request.requester.email },
    shortDescription: request.shortDescription,
    longDescription: request.longDescription,
    quantity: request.quantity,
    estimatedValue: request.estimatedValue !== null ? Number(request.estimatedValue) : null,
    concludedAt: request.updatedAt,
    supplier: po
      ? {
          legalName: po.supplierLegalName,
          cnpj: po.supplierCnpj,
          contactName: po.contactName,
          contactPhone: po.contactPhone,
          contactEmail: po.contactEmail,
        }
      : null,
    purchaseOrder: po
      ? {
          initialValue: Number(po.initialValue),
          negotiatedValue: Number(po.negotiatedValue),
          currency: po.currency,
          paymentCondition: po.paymentCondition,
          installments: po.installments,
          prazoEntrega: po.prazoEntrega,
          localEntrega: po.localEntrega,
          frete: po.frete,
          pdfUrl: po.pdfUrl ? `${process.env.APP_URL}${po.pdfUrl}` : null,
          items: po.items.map((it) => ({
            descricao: it.descricao,
            quantidade: Number(it.quantidade),
            valorUnitario: Number(it.valorUnitario),
            impostosPercent: Number(it.impostosPercent),
            valorTotal: Number(it.valorTotal),
          })),
        }
      : null,
    payment: request.payment
      ? {
          scheduledDate: request.payment.scheduledDate,
          paidDate: request.payment.paidDate,
          status: request.payment.status,
        }
      : null,
    fiscalDocument: request.fiscalDocument
      ? { documentUrl: request.fiscalDocument.documentUrl, approved: request.fiscalDocument.approved }
      : null,
    contract: request.contract
      ? { supplierName: request.contract.supplierName, startDate: request.contract.startDate, endDate: request.contract.endDate }
      : null,
    erpSyncedAt: request.erpSyncedAt,
    erpExternalId: request.erpExternalId,
    confirmUrl: `${process.env.APP_URL}/api/erp/purchase-requests/${request.id}/confirm`,
  });
}
