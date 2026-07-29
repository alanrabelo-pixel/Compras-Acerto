import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import fs from "fs";
import path from "path";
import { fitFontSize } from "./stringWidth";

/**
 * Pedido de Compra — layout portado 1:1 da especificação do gerador
 * Python/ReportLab já validado em produção pela Acerto (campos, ordem,
 * sem assinatura — ver conversa com o time de Compras | F&NC). O que foi
 * revisado aqui é só o acabamento visual (cores, tipografia, espaçamento)
 * usando a identidade oficial da marca (verde #25D366, extraído do SVG do
 * logo em "Materiais da Marca" no Confluence) — a estrutura/conteúdo do
 * documento não muda sem validar com o time.
 *
 * Sem limite de itens: até 6 linhas, a tabela preenche uma única página A4
 * paisagem (preenchendo linhas em branco até 6, para manter o visual
 * original). Acima disso, o @react-pdf/renderer pagina automaticamente —
 * cada linha (`wrap={false}`) nunca é cortada ao meio, e o cabeçalho da
 * tabela (`fixed`) se repete em toda página de continuação.
 */

// Dados fixos da Acerto (hardcoded — sempre os mesmos em todo Pedido de Compra).
const ACERTO = {
  razaoSocial: "Acerto Cobrança e Informações Cadastrais S.A.",
  cnpj: "24.533.496/0001-27",
  endereco: "Rua Bernardo Mascarenhas 46, Belo Horizonte/MG – 30.380-010",
};

// Logo oficial (verde, PNG) — baixado do Drive de materiais de marca da Acerto.
const LOGO_PATH = path.join(process.cwd(), "src/lib/pdf/assets/acerto-logo.png");

// RASCUNHO — substituir pelo texto oficial da cláusula de confidencialidade usada
// hoje no gerador Python antes de ir a produção (ver observação #4 abaixo).
const CONFIDENTIALITY_CLAUSE =
  "As partes se comprometem a manter sigilo sobre todas as informações comerciais, técnicas e financeiras " +
  "trocadas em razão deste pedido de compra, não as divulgando a terceiros sem autorização prévia por escrito.";

const OBSERVACOES = [
  "Faturamento conforme previsto no pedido.",
  "NF para financeiro@acerto.com.br e compras@acerto.com.br.",
  "Dúvidas/divergências para compras@acerto.com.br.",
  CONFIDENTIALITY_CLAUSE,
];

// Largura útil da página (A4 paisagem, 841.89pt, menos 24pt de margem de cada lado).
const PAGE_PADDING = 24;
const USABLE_WIDTH = 776;

// Larguras das colunas da tabela de itens — somam exatamente USABLE_WIDTH.
const COL = { descricao: 291, qtd: 55, valorUnitario: 145, impostos: 95, valorTotal: 190 };

// Paleta oficial Acerto (ver src/app/globals.css para os mesmos tokens no app web).
const GREEN = "#25D366";
const GREEN_DARK = "#1A9C4A";
const GREEN_TINT = "#EAF9EF";
const INK = "#0F172A";
const INK_SOFT = "#475467";
const INK_MUTED = "#98A2B3";
const BORDER = "#E4E7EC";
const ROW_ALT = "#FAFBFC";

const styles = StyleSheet.create({
  page: { padding: PAGE_PADDING, paddingBottom: 34, fontSize: 9, fontFamily: "Helvetica", color: INK },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 10 },
  headerRule: { height: 2, backgroundColor: BORDER, marginBottom: 14 },
  logoBox: { width: 190, height: 30, justifyContent: "center" },
  logoImg: { width: 118, height: 30, objectFit: "contain" },
  logoWordmark: { fontFamily: "Helvetica-Bold", fontSize: 20, color: GREEN },
  headerRight: { alignItems: "flex-end" },
  titlePedido: { fontFamily: "Helvetica-Bold", fontSize: 16, marginBottom: 4, color: INK, letterSpacing: 0.3 },
  headerLine: { fontSize: 8.5, textAlign: "right", color: INK_SOFT },
  headerLineStrong: { fontFamily: "Helvetica-Bold", color: INK },

  sectionLabel: {
    fontFamily: "Helvetica-Bold", fontSize: 7.5, color: GREEN_DARK, backgroundColor: GREEN_TINT,
    paddingVertical: 2, paddingHorizontal: 7, borderRadius: 8, alignSelf: "flex-start", marginBottom: 6,
  },

  boxesRow: { flexDirection: "row", gap: 12, marginTop: 12 },
  box: { flex: 1, border: `0.75pt solid ${BORDER}`, borderRadius: 6, padding: 8 },
  boxLine: { fontSize: 8.5, marginBottom: 2, color: INK_SOFT },
  boxLineLabel: { color: INK_MUTED },

  table: { marginTop: 12, borderRadius: 6, overflow: "hidden", border: `0.75pt solid ${BORDER}` },
  tableHeaderRow: { flexDirection: "row", backgroundColor: GREEN_TINT },
  tableRow: { flexDirection: "row", borderTop: `0.5pt solid ${BORDER}`, minHeight: 19 },
  tableRowAlt: { backgroundColor: ROW_ALT },
  th: { fontFamily: "Helvetica-Bold", fontSize: 7.5, padding: 5, color: GREEN_DARK },
  td: { fontSize: 8.5, padding: 5, justifyContent: "center", color: INK },

  fieldsRow: { flexDirection: "row", gap: 12, marginTop: 10 },
  fieldBox: { flex: 1, border: `0.75pt solid ${BORDER}`, borderRadius: 6, padding: 8 },
  fieldValue: { fontSize: 8.5, color: INK },

  entregaBox: { border: `0.75pt solid ${BORDER}`, borderRadius: 6, padding: 8, marginTop: 10 },

  obsBox: { backgroundColor: "#FCFCFD", border: `0.75pt solid ${BORDER}`, borderRadius: 6, padding: 10, marginTop: 12 },
  obsItem: { fontSize: 7.5, marginBottom: 3.5, lineHeight: 1.3, color: INK_SOFT },
  obsItemNum: { fontFamily: "Helvetica-Bold", color: GREEN_DARK },

  footer: {
    position: "absolute", bottom: 14, left: PAGE_PADDING, right: PAGE_PADDING,
    borderTop: `0.5pt solid ${BORDER}`, paddingTop: 6,
    flexDirection: "row", justifyContent: "space-between",
  },
  footerText: { fontSize: 7, color: INK_MUTED },
});

/** Texto de linha única que encolhe a fonte para caber em maxWidthPt (nunca quebra linha, nunca estoura). */
function FitText({
  text, maxWidthPt, baseFontSize = 8.5, bold = false, style,
}: { text: string; maxWidthPt: number; baseFontSize?: number; bold?: boolean; style?: object }) {
  const fontSize = fitFontSize({ text: text || "", maxWidthPt, baseFontSize, bold, minFontSize: 5.5 });
  return (
    <Text style={{ ...style, fontSize, fontFamily: bold ? "Helvetica-Bold" : "Helvetica" }} wrap={false}>
      {text}
    </Text>
  );
}

function money(v: number, currency: string) {
  return `${currency} ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function Logo() {
  if (fs.existsSync(LOGO_PATH)) {
    const data = fs.readFileSync(LOGO_PATH);
    return (
      <View style={styles.logoBox}>
        <Image style={styles.logoImg} src={{ data, format: "png" }} />
      </View>
    );
  }
  // Placeholder — substituir depositando o PNG oficial em src/lib/pdf/assets/acerto-logo.png
  return (
    <View style={styles.logoBox}>
      <Text style={styles.logoWordmark}>acerto.</Text>
    </View>
  );
}

export type PedidoCompraItem = {
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  impostosPercent: number;
  valorTotal: number;
};

export type PedidoCompraPdfData = {
  code: string;
  createdAt: string;
  supplierLegalName: string;
  supplierCnpj: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  paymentCondition: string;
  installments: number;
  installmentValue?: number | null;
  currency: string;
  prazoEntrega: string;
  localEntrega: string;
  frete: "CIF" | "FOB";
  items: PedidoCompraItem[];
};

const BOX_INNER_WIDTH = (USABLE_WIDTH - 12) / 2 - 16; // largura útil dentro de cada caixa (menos padding)

export function PedidoCompraDocument({ data }: { data: PedidoCompraPdfData }) {
  // Sem limite de itens — preenche com linhas em branco só até 6 (para manter
  // o visual original quando o pedido é pequeno); acima disso, renderiza
  // todas as linhas reais e deixa o react-pdf paginar automaticamente.
  const rows = [...data.items];
  while (rows.length < 6) {
    rows.push({ descricao: "", quantidade: 0, valorUnitario: 0, impostosPercent: 0, valorTotal: 0 });
  }

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Logo />
          <View style={styles.headerRight}>
            <Text style={styles.titlePedido}>PEDIDO DE COMPRA</Text>
            <Text style={styles.headerLine}>
              Nº do Pedido: <Text style={styles.headerLineStrong}>{data.code}</Text>
            </Text>
            <Text style={styles.headerLine}>
              Data de Emissão: <Text style={styles.headerLineStrong}>{new Date(data.createdAt).toLocaleDateString("pt-BR")}</Text>
            </Text>
          </View>
        </View>
        <View style={styles.headerRule} />

        <View style={styles.boxesRow}>
          <View style={styles.box}>
            <Text style={styles.sectionLabel}>ACERTO</Text>
            <FitText text={`Razão Social:  ${ACERTO.razaoSocial}`} maxWidthPt={BOX_INNER_WIDTH} style={styles.boxLine} />
            <FitText text={`CNPJ:  ${ACERTO.cnpj}`} maxWidthPt={BOX_INNER_WIDTH} style={styles.boxLine} />
            <FitText text={`Endereço:  ${ACERTO.endereco}`} maxWidthPt={BOX_INNER_WIDTH} style={styles.boxLine} />
          </View>
          <View style={styles.box}>
            <Text style={styles.sectionLabel}>FORNECEDOR</Text>
            <FitText text={`Razão Social:  ${data.supplierLegalName}`} maxWidthPt={BOX_INNER_WIDTH} style={styles.boxLine} />
            <FitText text={`CNPJ:  ${data.supplierCnpj}`} maxWidthPt={BOX_INNER_WIDTH} style={styles.boxLine} />
            <FitText
              text={`Contato:  ${data.contactName} · ${data.contactPhone} · ${data.contactEmail}`}
              maxWidthPt={BOX_INNER_WIDTH}
              style={styles.boxLine}
            />
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow} fixed>
            <Text style={[styles.th, { width: COL.descricao }]}>DESCRIÇÃO</Text>
            <Text style={[styles.th, { width: COL.qtd, textAlign: "right" }]}>QTD</Text>
            <Text style={[styles.th, { width: COL.valorUnitario, textAlign: "right" }]}>VLR. UNITÁRIO</Text>
            <Text style={[styles.th, { width: COL.impostos, textAlign: "right" }]}>IMPOSTOS (%)</Text>
            <Text style={[styles.th, { width: COL.valorTotal, textAlign: "right" }]}>VLR. TOTAL</Text>
          </View>
          {rows.map((item, i) => (
            <View key={i} wrap={false} style={[styles.tableRow, ...(i % 2 === 1 ? [styles.tableRowAlt] : [])]}>
              <View style={[styles.td, { width: COL.descricao }]}>
                <FitText text={item.descricao} maxWidthPt={COL.descricao - 12} />
              </View>
              <View style={[styles.td, { width: COL.qtd, alignItems: "flex-end" }]}>
                <FitText text={item.quantidade ? String(item.quantidade) : ""} maxWidthPt={COL.qtd - 12} />
              </View>
              <View style={[styles.td, { width: COL.valorUnitario, alignItems: "flex-end" }]}>
                <FitText text={item.valorUnitario ? money(item.valorUnitario, data.currency) : ""} maxWidthPt={COL.valorUnitario - 12} />
              </View>
              <View style={[styles.td, { width: COL.impostos, alignItems: "flex-end" }]}>
                <FitText text={item.impostosPercent ? `${item.impostosPercent.toFixed(2)}%` : ""} maxWidthPt={COL.impostos - 12} />
              </View>
              <View style={[styles.td, { width: COL.valorTotal, alignItems: "flex-end" }]}>
                <FitText text={item.valorTotal ? money(item.valorTotal, data.currency) : ""} maxWidthPt={COL.valorTotal - 12} baseFontSize={8.5} bold />
              </View>
            </View>
          ))}
        </View>

        <View style={styles.fieldsRow}>
          <View style={styles.fieldBox}>
            <Text style={styles.sectionLabel}>CONDIÇÃO DE PAGAMENTO</Text>
            <FitText
              text={
                data.installmentValue
                  ? `${data.paymentCondition} (${data.installments}x de ${money(data.installmentValue, data.currency)})`
                  : `${data.paymentCondition} (${data.installments}x)`
              }
              maxWidthPt={BOX_INNER_WIDTH}
              baseFontSize={8.5}
              style={styles.fieldValue}
            />
          </View>
          <View style={styles.fieldBox}>
            <Text style={styles.sectionLabel}>PRAZO DE ENTREGA</Text>
            <FitText text={data.prazoEntrega} maxWidthPt={BOX_INNER_WIDTH} baseFontSize={8.5} style={styles.fieldValue} />
          </View>
          <View style={[styles.fieldBox, { flex: 0.5 }]}>
            <Text style={styles.sectionLabel}>FRETE</Text>
            <Text style={[styles.fieldValue, { fontFamily: "Helvetica-Bold" }]}>{data.frete}</Text>
          </View>
        </View>

        <View style={styles.entregaBox}>
          <Text style={styles.sectionLabel}>LOCAL DE ENTREGA / INSTRUÇÕES DE RECEBIMENTO</Text>
          <Text style={styles.fieldValue}>{data.localEntrega}</Text>
        </View>

        <View style={styles.obsBox}>
          <Text style={styles.sectionLabel}>OBSERVAÇÕES</Text>
          {OBSERVACOES.map((obs, i) => (
            <Text key={i} style={styles.obsItem}>
              <Text style={styles.obsItemNum}>{i + 1}.  </Text>
              {obs}
            </Text>
          ))}
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Acerto Cobrança e Informações Cadastrais S.A. · CNPJ 24.533.496/0001-27</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
