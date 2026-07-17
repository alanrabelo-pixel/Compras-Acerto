import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireErpAuth } from "@/lib/erpAuth";

/**
 * GET /api/erp/purchase-requests?status=pending|synced|all
 *
 * Ponto de entrada para o futuro ERP puxar as solicitações já CONCLUIDAS
 * (última etapa do fluxo) e prontas para virar lançamento do lado dele.
 * "pending" (padrão) = ainda não confirmadas via /confirm.
 *
 * Autenticação: header Authorization: Bearer <ERP_API_KEY>.
 */
export async function GET(req: NextRequest) {
  const authError = requireErpAuth(req);
  if (authError) return authError;

  const status = req.nextUrl.searchParams.get("status") ?? "pending";

  const where =
    status === "pending"
      ? { currentStage: "CONCLUIDO" as const, erpSyncedAt: null }
      : status === "synced"
      ? { currentStage: "CONCLUIDO" as const, erpSyncedAt: { not: null } }
      : { currentStage: "CONCLUIDO" as const };

  const requests = await prisma.purchaseRequest.findMany({
    where,
    include: { costCenter: true, purchaseOrder: true },
    orderBy: { updatedAt: "asc" },
  });

  return NextResponse.json(
    requests.map((r) => ({
      id: r.id,
      code: r.code,
      shortDescription: r.shortDescription,
      costCenter: r.costCenter.name,
      supplierLegalName: r.purchaseOrder?.supplierLegalName ?? null,
      negotiatedValue: r.purchaseOrder ? Number(r.purchaseOrder.negotiatedValue) : null,
      concludedAt: r.updatedAt,
      erpSyncedAt: r.erpSyncedAt,
      erpExternalId: r.erpExternalId,
      detailUrl: `${process.env.APP_URL}/api/erp/purchase-requests/${r.id}`,
    }))
  );
}
