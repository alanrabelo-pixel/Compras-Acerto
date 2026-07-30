import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

/**
 * Resumo executivo em PDF do Dashboard de Compras — números e listas (sem
 * os gráficos interativos, que não têm equivalente estático razoável em
 * @react-pdf/renderer sem rasterizar cada SVG). Pensado para ser anexado a
 * um e-mail/apresentação de diretoria, não para reproduzir a tela pixel a
 * pixel.
 */

const GREEN_DARK = "#1A9C4A";
const INK = "#0F172A";
const INK_SOFT = "#475467";
const INK_MUTED = "#98A2B3";
const BORDER = "#E4E7EC";
const SURFACE_MUTED = "#F7F8FA";
const DANGER = "#D92D20";
const WARNING = "#B54708";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9.5, fontFamily: "Helvetica", color: INK },
  h1: { fontFamily: "Helvetica-Bold", fontSize: 18, color: GREEN_DARK, marginBottom: 2 },
  subtitle: { fontSize: 9.5, color: INK_MUTED, marginBottom: 18 },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 11, color: INK, marginTop: 16, marginBottom: 8 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kpiCard: { width: 122, backgroundColor: SURFACE_MUTED, borderRadius: 6, padding: 8, marginBottom: 8 },
  kpiValue: { fontFamily: "Helvetica-Bold", fontSize: 13, color: GREEN_DARK },
  kpiLabel: { fontSize: 8, color: INK_MUTED, marginTop: 2 },
  row: { flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER, paddingVertical: 5 },
  rowHead: { flexDirection: "row", backgroundColor: SURFACE_MUTED, paddingVertical: 5, borderRadius: 4 },
  cellBold: { fontFamily: "Helvetica-Bold" },
  alertText: { fontSize: 9, marginBottom: 4 },
  footer: { position: "absolute", bottom: 20, left: 32, right: 32, fontSize: 7.5, color: INK_MUTED, textAlign: "center" },
});

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

export type DashboardSummaryProps = {
  generatedAt: string;
  totalSpend: string;
  requestCount: number;
  poCount: number;
  avgCycleDays: string;
  savingPct: string;
  slaCompliancePct: string;
  categoryBreakdown: { label: string; value: string }[];
  topSuppliers: { name: string; value: string; count: number; avgSaving: string }[];
  buyerRanking: { name: string; count: number; value: string; slaPct: string }[];
  expiringContracts: { supplierName: string; area: string; daysToRenewal: number }[];
  alerts: { severity: "danger" | "warning"; text: string }[];
};

export function DashboardSummaryDocument(props: DashboardSummaryProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Resumo Executivo — Compras</Text>
        <Text style={styles.subtitle}>Acerto · Gerado em {props.generatedAt}</Text>

        <View style={styles.kpiGrid}>
          <Kpi label="Valor Comprado" value={props.totalSpend} />
          <Kpi label="Solicitações" value={String(props.requestCount)} />
          <Kpi label="Pedidos Emitidos" value={String(props.poCount)} />
          <Kpi label="Ciclo Médio" value={props.avgCycleDays} />
          <Kpi label="Saving %" value={props.savingPct} />
          <Kpi label="SLA Cumprido" value={props.slaCompliancePct} />
        </View>

        <Text style={styles.sectionTitle}>Gasto por Categoria</Text>
        <View style={styles.rowHead}>
          <Text style={[{ flex: 2 }, styles.cellBold]}>Categoria</Text>
          <Text style={[{ flex: 1 }, styles.cellBold]}>Valor</Text>
        </View>
        {props.categoryBreakdown.map((c, i) => (
          <View key={i} style={styles.row}>
            <Text style={{ flex: 2 }}>{c.label}</Text>
            <Text style={{ flex: 1 }}>{c.value}</Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Top Fornecedores</Text>
        <View style={styles.rowHead}>
          <Text style={[{ flex: 2 }, styles.cellBold]}>Fornecedor</Text>
          <Text style={[{ flex: 1 }, styles.cellBold]}>Valor</Text>
          <Text style={[{ flex: 0.6 }, styles.cellBold]}>Qtd.</Text>
          <Text style={[{ flex: 0.8 }, styles.cellBold]}>Saving</Text>
        </View>
        {props.topSuppliers.map((s, i) => (
          <View key={i} style={styles.row}>
            <Text style={{ flex: 2 }}>{s.name}</Text>
            <Text style={{ flex: 1 }}>{s.value}</Text>
            <Text style={{ flex: 0.6 }}>{s.count}</Text>
            <Text style={{ flex: 0.8 }}>{s.avgSaving}</Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Top Compradores</Text>
        <View style={styles.rowHead}>
          <Text style={[{ flex: 2 }, styles.cellBold]}>Comprador</Text>
          <Text style={[{ flex: 1 }, styles.cellBold]}>Valor</Text>
          <Text style={[{ flex: 0.6 }, styles.cellBold]}>Qtd.</Text>
          <Text style={[{ flex: 0.8 }, styles.cellBold]}>SLA</Text>
        </View>
        {props.buyerRanking.map((b, i) => (
          <View key={i} style={styles.row}>
            <Text style={{ flex: 2 }}>{b.name}</Text>
            <Text style={{ flex: 1 }}>{b.value}</Text>
            <Text style={{ flex: 0.6 }}>{b.count}</Text>
            <Text style={{ flex: 0.8 }}>{b.slaPct}</Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Contratos Vencendo (60 dias)</Text>
        {props.expiringContracts.length === 0 ? (
          <Text style={{ fontSize: 9, color: INK_MUTED }}>Nenhum contrato vencendo neste recorte.</Text>
        ) : (
          props.expiringContracts.map((c, i) => (
            <View key={i} style={styles.row}>
              <Text style={{ flex: 2 }}>{c.supplierName} · {c.area}</Text>
              <Text style={{ flex: 1, color: c.daysToRenewal <= 30 ? DANGER : WARNING }}>
                {c.daysToRenewal <= 0 ? "vencido" : `${c.daysToRenewal}d`}
              </Text>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>Alertas</Text>
        {props.alerts.length === 0 ? (
          <Text style={{ fontSize: 9, color: GREEN_DARK }}>Nenhum alerta no momento.</Text>
        ) : (
          props.alerts.map((a, i) => (
            <Text key={i} style={[styles.alertText, { color: a.severity === "danger" ? DANGER : WARNING }]}>
              {a.severity === "danger" ? "● " : "○ "}{a.text}
            </Text>
          ))
        )}

        <Text style={styles.footer} fixed>Acerto Compras — resumo gerado automaticamente a partir dos dados do sistema.</Text>
      </Page>
    </Document>
  );
}
