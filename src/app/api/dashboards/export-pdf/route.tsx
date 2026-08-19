import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { DashboardSummaryDocument } from "@/lib/pdf/dashboardSummary";
import { loadDashboardData, money } from "@/lib/dashboard-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/dashboards/export-pdf: resumo executivo em PDF, com o MESMO
// recorte de filtros da tela (ver DashboardHeader / dashboards/page.tsx).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const data = await loadDashboardData({
    diretoria: sp.get("diretoria") ?? undefined,
    costCenterId: sp.get("costCenterId") ?? undefined,
    demandType: sp.get("demandType") ?? undefined,
    stage: sp.get("stage") ?? undefined,
    status: sp.get("status") ?? undefined,
    buyerId: sp.get("buyerId") ?? undefined,
    supplierId: sp.get("supplierId") ?? undefined,
    de: sp.get("de") ?? undefined,
    ate: sp.get("ate") ?? undefined,
  });

  const buffer = await renderToBuffer(
    <DashboardSummaryDocument
      generatedAt={data.generatedAt.toLocaleString("pt-BR")}
      totalSpend={money(data.kpis.totalSpend.value)}
      requestCount={data.kpis.requestCount.value}
      poCount={data.kpis.poCount.value}
      avgCycleDays={`${data.kpis.avgCycleDays.value.toFixed(1)} dias`}
      savingPct={`${data.kpis.savingPct.value.toFixed(1)}%`}
      slaCompliancePct={data.current.slaCompliancePct === null ? "N/A" : `${data.current.slaCompliancePct.toFixed(0)}%`}
      topSuppliers={data.topSuppliers.map((s) => ({ name: s.name, value: money(s.value), count: s.count, avgSaving: `${s.avgSaving.toFixed(1)}%` }))}
      buyerRanking={data.buyerRanking.map((b) => ({ name: b.name, count: b.count, value: money(b.value), slaPct: b.slaPct === null ? "N/A" : `${b.slaPct.toFixed(0)}%` }))}
      expiringContracts={data.contractsPanel.list.map((c) => ({ supplierName: c.supplierName, area: c.area, daysToRenewal: c.daysToRenewal }))}
      alerts={data.alerts}
    />
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="resumo-executivo-compras.pdf"`,
    },
  });
}
