import { NextRequest, NextResponse } from "next/server";
import { exigirQuadro } from "@/lib/acesso";
import { generateInsight, buildAlertsPriorityPrompt, type AlertForPriority } from "@/lib/integrations/ai";

/**
 * POST /api/dashboards/alerts-priority (item 2.9 do diagnóstico de IA): pede
 * para a IA reordenar por urgência real a MESMA lista de alertas que já
 * aparece no painel "Alertas Inteligentes" do Dashboard (ver
 * src/lib/dashboard-data.ts) — nenhum alerta novo é criado ou descartado, só
 * a leitura de qual atacar primeiro.
 *
 * Stateless de propósito, sem tabela de histórico: diferente de AiInsight
 * (que é sempre por PurchaseRequest), aqui não há uma solicitação para
 * pendurar o registro, e o recorte muda a cada filtro do Dashboard — não
 * faz sentido guardar "a priorização de terça-feira às 14h" como histórico.
 */
export async function POST(req: NextRequest) {
  const barrado = await exigirQuadro("a priorização de alertas por IA");
  if (barrado) return barrado;

  const body = await req.json();
  const { alerts } = body as { alerts?: AlertForPriority[] };
  if (!Array.isArray(alerts) || alerts.length === 0) {
    return NextResponse.json({ error: "Nenhum alerta para priorizar neste recorte." }, { status: 422 });
  }

  const prompt = buildAlertsPriorityPrompt(alerts);
  const { anthropic, gemini } = await generateInsight(prompt);

  const bothFailed = !anthropic.payload && !gemini.payload;
  return NextResponse.json({ anthropic, gemini }, { status: bothFailed ? 502 : 200 });
}
