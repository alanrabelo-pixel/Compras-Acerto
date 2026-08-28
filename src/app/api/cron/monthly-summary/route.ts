import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verificarTokenDeMaquina } from "@/lib/segredos";
import { logger } from "@/lib/logger";
import { loadDashboardData } from "@/lib/dashboard-data";
import { generateInsight, buildMonthlySummaryPrompt, type AiInsightPayload } from "@/lib/integrations/ai";
import { avisarVarios } from "@/lib/avisar";
import { destinatariosResumoExecutivo } from "@/lib/destinatarios";

/**
 * Item 2.8 do diagnóstico de IA: resumo executivo mensal, automático (sem
 * aprovação humana) — mesma justificativa do próprio diagnóstico: é
 * puramente informativo, a fonte é 100% determinística (loadDashboardData,
 * o mesmo agregado que já alimenta o Dashboard) e reaproveita um canal que já
 * é automático (avisar/avisarVarios, os mesmos do escalonamento de aprovação
 * e do alerta de contrato).
 *
 * CADÊNCIA: decidida pelo agendador externo (Railway Cron / Vercel Cron),
 * configurado para rodar uma vez por mês. Diferente do alerta de contrato,
 * aqui não existe uma tabela dedicada de histórico de envio — o guard de
 * duplicidade reaproveita o próprio Notification (já criado por
 * sendPurchaseEmail a cada envio, ver src/lib/integrations/gmail.ts): se já
 * existe um envio bem-sucedido com o assunto deste mês, a rota não manda de
 * novo, mesmo que o agendador dispare duas vezes.
 *
 * Destinatários vêm de DESTINATARIOS_RESUMO_EXECUTIVO (e-mails separados por
 * vírgula). Sem a variável configurada, não há para quem mandar — a rota não
 * inventa destinatário, só loga e retorna sem enviar.
 */
export async function GET(req: NextRequest) {
  const credencial = verificarTokenDeMaquina(req.headers.get("authorization"), "CRON_SECRET");
  if (!credencial.ok) {
    return NextResponse.json({ error: credencial.erro }, { status: credencial.status });
  }

  const destinatarios = destinatariosResumoExecutivo();
  if (destinatarios.length === 0) {
    logger.warn("cron_resumo_executivo_sem_destinatarios");
    return NextResponse.json({ enviado: false, motivo: "DESTINATARIOS_RESUMO_EXECUTIVO não configurada" });
  }

  const agora = new Date();
  const primeiroDesteMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const primeiroDoMesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
  const ultimoDoMesAnterior = new Date(primeiroDesteMes.getTime() - 1);
  const mesLabelBruto = primeiroDoMesAnterior.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const monthLabel = `${mesLabelBruto.charAt(0).toUpperCase()}${mesLabelBruto.slice(1)}`;
  const assunto = `Resumo executivo de Compras — ${monthLabel}`;

  const jaEnviado = await prisma.notification.findFirst({
    where: { channel: "EMAIL", status: "ENVIADO", subject: assunto },
  });
  if (jaEnviado) {
    logger.info("cron_resumo_executivo_ja_enviado", { monthLabel });
    return NextResponse.json({ enviado: false, motivo: "já enviado neste mês" });
  }

  const toISODate = (d: Date) => d.toISOString().slice(0, 10);
  const data = await loadDashboardData({ de: toISODate(primeiroDoMesAnterior), ate: toISODate(ultimoDoMesAnterior) });

  const prompt = buildMonthlySummaryPrompt({
    monthLabel,
    totalSpend: data.kpis.totalSpend,
    requestCount: data.kpis.requestCount,
    poCount: data.kpis.poCount,
    avgCycleDays: data.kpis.avgCycleDays,
    totalSaving: data.kpis.totalSaving,
    savingPct: data.kpis.savingPct,
    slaCompliancePct: data.kpis.slaCompliancePct,
    topCostCenters: data.costCenterBreakdown.slice(0, 5),
    topSuppliers: data.topSuppliers.slice(0, 5).map((s) => ({ name: s.name, value: s.value, count: s.count })),
    riskMap: data.riskMap,
  });

  const { anthropic, gemini } = await generateInsight(prompt);
  // Melhor esforço: se um provedor falhar, usa o outro; se os dois falharem,
  // o resumo ainda sai só com os números (determinísticos), sem narrativa.
  const narrativa = anthropic.payload ?? gemini.payload;
  if (!narrativa) {
    logger.warn("cron_resumo_executivo_sem_narrativa_ia", { monthLabel, erroAnthropic: anthropic.error, erroGemini: gemini.error });
  }

  const fmtDelta = (deltaPct: number | null) => (deltaPct === null ? "" : ` (${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}% vs. mês anterior)`);
  const dashboardLink = `${process.env.APP_URL}/dashboards`;

  const kpiLinesHtml = [
    `Gasto total: R$ ${data.kpis.totalSpend.value.toLocaleString("pt-BR")}${fmtDelta(data.kpis.totalSpend.deltaPct)}`,
    `Solicitações abertas: ${data.kpis.requestCount.value}${fmtDelta(data.kpis.requestCount.deltaPct)}`,
    `Pedidos de Compra gerados: ${data.kpis.poCount.value}${fmtDelta(data.kpis.poCount.deltaPct)}`,
    `Ciclo médio: ${data.kpis.avgCycleDays.value.toFixed(1)} dias${fmtDelta(data.kpis.avgCycleDays.deltaPct)}`,
    `Saving total: R$ ${data.kpis.totalSaving.value.toLocaleString("pt-BR")} (${data.kpis.savingPct.value.toFixed(1)}%)${fmtDelta(data.kpis.savingPct.deltaPct)}`,
    `Aderência à SLA: ${data.kpis.slaCompliancePct.value.toFixed(1)}%${fmtDelta(data.kpis.slaCompliancePct.deltaPct)}`,
  ];

  const sinalizacoes = [
    data.riskMap.overdueCount > 0 ? `${data.riskMap.overdueCount} solicitação(ões) em atraso de SLA` : null,
    data.riskMap.fragmentationCount > 0 ? `${data.riskMap.fragmentationCount} sinalizada(s) por risco de fracionamento` : null,
    data.riskMap.noContractCount > 0 ? `${data.riskMap.noContractCount} sem contrato mapeado apesar de exigir` : null,
    data.riskMap.budgetExceptionsPending > 0 ? `${data.riskMap.budgetExceptionsPending} exceção(ões) orçamentária(s) pendente(s)` : null,
    data.riskMap.personifiedApprovals > 0 ? `${data.riskMap.personifiedApprovals} aprovação(ões) personificada(s)` : null,
    data.riskMap.emergencyCount > 0 ? `${data.riskMap.emergencyCount} solicitação(ões) de prioridade crítica` : null,
  ].filter((s): s is string => Boolean(s));

  const narrativaHtml = (n: AiInsightPayload) =>
    `<p>${n.summary}</p>` +
    (n.highlights.length > 0 ? `<ul>${n.highlights.map((h) => `<li>${h}</li>`).join("")}</ul>` : "") +
    (n.cautions.length > 0 ? `<p><b>Atenção:</b></p><ul>${n.cautions.map((c) => `<li>${c}</li>`).join("")}</ul>` : "");

  const html =
    `<h2>${assunto}</h2>` +
    (narrativa ? narrativaHtml(narrativa) : `<p><i>Leitura por IA indisponível neste mês; seguem os números.</i></p>`) +
    `<h3>Indicadores</h3><ul>${kpiLinesHtml.map((l) => `<li>${l}</li>`).join("")}</ul>` +
    (data.costCenterBreakdown.length > 0
      ? `<h3>Top centros de custo</h3><ul>${data.costCenterBreakdown
          .slice(0, 5)
          .map((c) => `<li>${c.label}: R$ ${c.value.toLocaleString("pt-BR")} (${c.count})</li>`)
          .join("")}</ul>`
      : "") +
    (data.topSuppliers.length > 0
      ? `<h3>Top fornecedores</h3><ul>${data.topSuppliers
          .slice(0, 5)
          .map((s) => `<li>${s.name}: R$ ${s.value.toLocaleString("pt-BR")} (${s.count})</li>`)
          .join("")}</ul>`
      : "") +
    (sinalizacoes.length > 0 ? `<h3>Sinalizações vigentes</h3><ul>${sinalizacoes.map((s) => `<li>${s}</li>`).join("")}</ul>` : "") +
    `<p><a href="${dashboardLink}">Abrir o Dashboard completo</a></p>`;

  const slack =
    `*${assunto}*\n` +
    (narrativa ? `${narrativa.summary}\n` : "_Leitura por IA indisponível neste mês; seguem os números._\n") +
    kpiLinesHtml.map((l) => `• ${l}`).join("\n") +
    (sinalizacoes.length > 0 ? `\n*Sinalizações:* ${sinalizacoes.join(" · ")}` : "") +
    `\n<${dashboardLink}|Abrir o Dashboard completo>`;

  await avisarVarios(destinatarios, (para) => ({
    para,
    assunto,
    html,
    slack,
    origem: "resumo executivo mensal",
  }));

  logger.info("cron_resumo_executivo_enviado", { monthLabel, destinatarios: destinatarios.length, narrativaDisponivel: Boolean(narrativa) });
  return NextResponse.json({ enviado: true, monthLabel, destinatarios: destinatarios.length });
}
