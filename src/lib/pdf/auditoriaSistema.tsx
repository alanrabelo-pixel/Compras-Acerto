import { Document, Page, Text, View, StyleSheet, Image, Svg, Path, Rect, Line, Font } from "@react-pdf/renderer";
import fs from "fs";
import path from "path";

/**
 * Mapa Funcional Completo: documento de referência para auditoria interna.
 * Diferente do Manual do Processo (src/lib/pdf/manualProcesso.tsx, que é um
 * guia amigável pra quem usa o sistema no dia a dia), este documento é
 * intencionalmente denso e técnico: toda etapa, toda condição de ramificação,
 * todo papel envolvido, com referência a arquivo e linha do código-fonte real.
 * Pensado pra alguém auditar o sistema e decidir o que ainda falta ajustar.
 */

Font.register({
  family: "Montserrat",
  fonts: [
    { src: path.join(process.cwd(), "src/lib/pdf/assets/fonts/Montserrat-Regular.ttf"), fontWeight: 400 },
    { src: path.join(process.cwd(), "src/lib/pdf/assets/fonts/Montserrat-SemiBold.ttf"), fontWeight: 600 },
    { src: path.join(process.cwd(), "src/lib/pdf/assets/fonts/Montserrat-Bold.ttf"), fontWeight: 700 },
  ],
});

const ICONS = path.join(process.cwd(), "src/lib/pdf/assets/manual-icons");
function img(name: string) {
  const p = path.join(ICONS, name);
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}
const ASSETS = {
  wordmarkWhite: img("acerto-wordmark-white.png"),
  wordmarkGreen: img("acerto-wordmark-green.png"),
  sorrisoBranco: img("sorriso-branco.png"),
  relogio: img("relogio-generico.png"),
  historico: img("historico-generico.png"),
  cadeado: img("cadeado-fechado.png"),
  documentoCheck: img("documento-check.png"),
  alvo: img("alvo-verde.png"),
};

const GREEN = "#25D366";
const GREEN_DARK = "#128C3E";
const BLACK = "#000000";
const INK_SOFT = "#3B3F45";
const GRAY_BG = "#F5F6FA";
const WHITE = "#FFFFFF";
const BORDER = "#E3E5EC";
const DANGER = "#C43D3D";
const AMBER = "#B8760F";
const MUTED = "#8A8F98";

const PAGE_PADDING = 36;

const styles = StyleSheet.create({
  cover: { backgroundColor: BLACK, padding: 0, fontFamily: "Montserrat" },
  coverWordmark: { width: 140, height: 35, objectFit: "contain", marginTop: 90, marginLeft: 48 },
  coverKicker: {
    color: GREEN, backgroundColor: "rgba(37,211,102,0.12)", fontSize: 9, fontWeight: 700, alignSelf: "flex-start",
    marginLeft: 48, marginTop: 26, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 10,
    letterSpacing: 1,
  },
  coverTitle: { color: WHITE, fontSize: 28, fontWeight: 700, marginTop: 18, marginLeft: 48, marginRight: 48, lineHeight: 1.25 },
  coverSubtitle: { color: "rgba(255,255,255,0.72)", fontSize: 12, fontWeight: 400, marginTop: 14, marginLeft: 48, marginRight: 100, lineHeight: 1.5 },
  coverDate: { color: "rgba(255,255,255,0.55)", fontSize: 9, fontWeight: 400, position: "absolute", bottom: 40, left: 48 },
  coverSystem: { color: GREEN, fontSize: 14, fontWeight: 700, marginTop: 40, marginLeft: 48 },

  page: { padding: PAGE_PADDING, paddingTop: 60, paddingBottom: 44, fontFamily: "Montserrat", fontSize: 9, color: INK_SOFT },
  runningHeader: {
    position: "absolute", top: 22, left: PAGE_PADDING, right: PAGE_PADDING,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingBottom: 7, borderBottom: `0.75pt solid ${BORDER}`,
  },
  runningHeaderLogo: { width: 62, height: 16, objectFit: "contain" },
  runningHeaderText: { fontSize: 7.5, color: INK_SOFT, fontWeight: 600 },
  footer: {
    position: "absolute", bottom: 22, left: PAGE_PADDING, right: PAGE_PADDING,
    flexDirection: "row", justifyContent: "space-between", borderTop: `0.5pt solid ${BORDER}`, paddingTop: 6,
  },
  footerText: { fontSize: 7, color: MUTED },

  h1: { fontSize: 15, fontWeight: 700, color: BLACK, marginBottom: 8 },
  h1Bar: { width: 28, height: 4, backgroundColor: GREEN, borderRadius: 2, marginBottom: 6 },
  h2: { fontSize: 10.5, fontWeight: 700, color: GREEN_DARK, marginTop: 10, marginBottom: 5 },
  h3: { fontSize: 9.5, fontWeight: 700, color: BLACK, marginTop: 6, marginBottom: 3 },
  body: { fontSize: 9, lineHeight: 1.45, color: INK_SOFT, marginBottom: 6 },
  mono: { fontSize: 7.5, color: MUTED },
  sectionBlock: { marginBottom: 14 },

  card: { backgroundColor: GRAY_BG, borderRadius: 6, padding: 9, marginBottom: 7 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  cardTitle: { fontSize: 9.5, fontWeight: 700, color: BLACK },
  cardRole: { fontSize: 7.5, fontWeight: 700, color: GREEN_DARK, backgroundColor: "rgba(37,211,102,0.12)", paddingVertical: 2, paddingHorizontal: 6, borderRadius: 8 },
  cardLine: { fontSize: 8.5, lineHeight: 1.4, color: INK_SOFT, marginBottom: 2 },
  cardLabel: { fontWeight: 700, color: BLACK },
  cardFile: { fontSize: 7, color: MUTED, marginTop: 3 },

  bullet: { flexDirection: "row", marginBottom: 4, gap: 5 },
  bulletDot: { color: GREEN_DARK, fontWeight: 700, fontSize: 9 },
  bulletText: { fontSize: 8.5, lineHeight: 1.4, color: INK_SOFT, flex: 1 },

  table: { borderRadius: 5, overflow: "hidden", border: `0.75pt solid ${BORDER}`, marginTop: 3, marginBottom: 8 },
  tr: { flexDirection: "row", borderTop: `0.5pt solid ${BORDER}` },
  trHead: { flexDirection: "row", backgroundColor: BLACK },
  th: { fontSize: 7.5, fontWeight: 700, color: WHITE, padding: 5 },
  td: { fontSize: 7.8, color: INK_SOFT, padding: 5 },
  tdStrong: { fontWeight: 700, color: BLACK },

  toc: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4.5, borderBottom: `0.5pt solid ${BORDER}` },
  tocText: { fontSize: 9.5, color: INK_SOFT },
  tocNum: { fontSize: 9.5, fontWeight: 700, color: GREEN_DARK, width: 22 },

  finding: { flexDirection: "row", gap: 8, marginBottom: 8, alignItems: "flex-start" },
  findingBadge: { width: 16, height: 16, borderRadius: 8, textAlign: "center", paddingTop: 3.2, fontSize: 7.5, fontWeight: 700, color: WHITE, flexShrink: 0 },
  findingBody: { flex: 1 },
  findingTitle: { fontSize: 8.8, fontWeight: 700, color: BLACK, marginBottom: 1.5 },
  findingText: { fontSize: 8.3, lineHeight: 1.42, color: INK_SOFT },
});

function RunningHeader({ label }: { label: string }) {
  return (
    <View style={styles.runningHeader} fixed>
      {ASSETS.wordmarkGreen && <Image style={styles.runningHeaderLogo} src={{ data: ASSETS.wordmarkGreen, format: "png" }} />}
      <Text style={styles.runningHeaderText}>{label}</Text>
    </View>
  );
}
function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>Mapa Funcional Completo. Uso interno Acerto, confidencial.</Text>
      <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}
function H1({ children, bookmark }: { children: string; bookmark?: string }) {
  return (
    <View style={styles.sectionBlock} bookmark={bookmark ? { title: bookmark } : undefined} break>
      <View style={styles.h1Bar} />
      <Text style={styles.h1}>{children}</Text>
    </View>
  );
}
function H2({ children }: { children: string }) {
  return <Text style={styles.h2}>{children}</Text>;
}
function P({ children }: { children: React.ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}
function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bullet}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

/** Card de detalhamento de uma etapa da máquina de estados. */
function StageCard({
  n, title, role, trigger, branches, effects, file,
}: {
  n: number;
  title: string;
  role: string;
  trigger: string;
  branches: string[];
  effects: string[];
  file: string;
}) {
  return (
    <View style={styles.card} wrap={false}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{n}. {title}</Text>
        <Text style={styles.cardRole}>{role}</Text>
      </View>
      <Text style={styles.cardLine}><Text style={styles.cardLabel}>Disparo: </Text>{trigger}</Text>
      {branches.map((b, i) => (
        <Text style={styles.cardLine} key={i}><Text style={styles.cardLabel}>{"> "}</Text>{b}</Text>
      ))}
      {effects.length > 0 && (
        <Text style={styles.cardLine}><Text style={styles.cardLabel}>Efeitos colaterais: </Text>{effects.join(". ")}.</Text>
      )}
      <Text style={styles.cardFile}>{file}</Text>
    </View>
  );
}

const SEVERITY = {
  regra: { label: "R", color: DANGER },
  doc: { label: "D", color: AMBER },
  admin: { label: "A", color: GREEN_DARK },
  seg: { label: "S", color: BLACK },
} as const;

/** Situação de cada achado depois da rodada de correções de 19/08/2026. */
const SITUACAO = {
  resolvido: { rotulo: "RESOLVIDO", cor: GREEN_DARK },
  parcial: { rotulo: "PARCIAL", cor: AMBER },
  aberto: { rotulo: "EM ABERTO", cor: MUTED },
} as const;

function Finding({
  n, severity, title, situacao = "aberto", children, comoFoiResolvido,
}: {
  n: number;
  severity: keyof typeof SEVERITY;
  title: string;
  situacao?: keyof typeof SITUACAO;
  children: React.ReactNode;
  comoFoiResolvido?: string;
}) {
  const s = SEVERITY[severity];
  const st = SITUACAO[situacao];
  return (
    <View style={styles.finding} wrap={false}>
      <Text style={[styles.findingBadge, { backgroundColor: situacao === "resolvido" ? MUTED : s.color }]}>{n}</Text>
      <View style={styles.findingBody}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 1.5 }}>
          <Text style={[styles.findingTitle, { marginBottom: 0 }]}>{title}</Text>
          <Text style={{ fontSize: 6.5, fontWeight: 700, color: st.cor, borderRadius: 2, borderWidth: 0.5, borderColor: st.cor, paddingVertical: 1, paddingHorizontal: 3 }}>
            {st.rotulo}
          </Text>
        </View>
        <Text style={styles.findingText}>{children}</Text>
        {comoFoiResolvido && (
          <Text style={[styles.findingText, { color: GREEN_DARK, marginTop: 2 }]}>
            Correção: {comoFoiResolvido}
          </Text>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Diagrama completo: desenhado manualmente em SVG (react-pdf), página única
// em tamanho "pôster" pra caber a máquina de estados inteira sem cortar fluxo.
// ---------------------------------------------------------------------------

const DIA_W = 1000;
const DIA_H = 2340; // 15 caixas x 140 + margens (era 16, ver STAGE_BOXES)
const BOX_W = 250;
const BOX_H = 58;
const MAIN_X = 300; // borda esquerda das caixas da coluna principal
const MAIN_CX = MAIN_X + BOX_W / 2;
const MAIN_RIGHT = MAIN_X + BOX_W;
const CANC_X = 760;
const CANC_Y = 700;
const CANC_W = 190;
const CANC_H = 66;

type StageBox = { key: string; label: string; y: number; sub?: string };
const STAGE_BOXES: StageBox[] = [
  // A Aprovação do Gestor era a 2 e saiu do fluxo em 21/08/2026: a abertura
  // vai direto para a Triagem. As demais subiram 140 e foram renumeradas, e
  // DIA_H caiu 140 junto. Não deixar a caixa aqui "só para o histórico": este
  // diagrama descreve o fluxo vigente, e boxByKey usa find()! sem rede, então
  // qualquer seta apontando para uma chave removida quebra na renderização.
  { key: "SOLICITACAO", label: "1. Solicitação de Compra", y: 150 },
  { key: "TRIAGEM", label: "2. Homologação e Triagem", y: 290 },
  { key: "VALIDACAO_ORCAMENTARIA", label: "3. Validação Orçamentária", y: 430, sub: "laço: exceção pendente" },
  { key: "DUE_DILIGENCE", label: "4. Due Diligence (Privacidade)", y: 570 },
  { key: "COTACAO", label: "5. Cotação", y: 710 },
  { key: "MAPA_COTACAO", label: "6. Mapa de Cotação", y: 850 },
  { key: "APROVACAO", label: "7. Aprovação", y: 990 },
  { key: "JURIDICO", label: "8. Jurídico", y: 1130 },
  { key: "PEDIDO_COMPRA", label: "9. Pedido de Compra", y: 1270 },
  { key: "AGUARDANDO_ENTREGA", label: "10. Aguardando Entrega/Conclusão", y: 1410 },
  { key: "MEDICAO", label: "11. Medição e Aprovação Financeira", y: 1550, sub: "laço: reprovado tecnicamente" },
  { key: "FISCAL", label: "12. Validação Fiscal", y: 1690, sub: "laço: documento reprovado" },
  { key: "TESOURARIA", label: "13. Tesouraria (Pagamento)", y: 1830 },
  { key: "MAPEAMENTO_CONTRATO", label: "14. Mapeamento de Contrato", y: 1970 },
  { key: "CONCLUIDO", label: "15. Concluído", y: 2110 },
];

function boxByKey(key: string) {
  const b = STAGE_BOXES.find((s) => s.key === key)!;
  return { ...b, cx: MAIN_CX, top: b.y - BOX_H / 2, bottom: b.y + BOX_H / 2, right: MAIN_RIGHT, left: MAIN_X };
}

// Seta reta para baixo (fluxo padrão, coluna central)
function StraightArrow({ fromKey, toKey }: { fromKey: string; toKey: string }) {
  const a = boxByKey(fromKey);
  const b = boxByKey(toKey);
  const x = a.cx;
  return (
    <>
      <Line x1={x} y1={a.bottom} x2={x} y2={b.top - 8} stroke={BLACK} strokeWidth={1.5} />
      <Path d={`M ${x - 5} ${b.top - 8} L ${x + 5} ${b.top - 8} L ${x} ${b.top} Z`} fill={BLACK} />
    </>
  );
}

// Curva à direita (ramificação de sucesso que pula etapas), cor verde
function SkipArrow({ fromKey, toKey, label }: { fromKey: string; toKey: string; label: string }) {
  const a = boxByKey(fromKey);
  const b = boxByKey(toKey);
  const x1 = a.right;
  const y1 = a.y;
  const x2 = b.right;
  const y2 = b.y;
  const bulge = x1 + 150;
  return (
    <>
      <Path d={`M ${x1} ${y1} C ${bulge} ${y1}, ${bulge} ${y2}, ${x2 + 10} ${y2}`} stroke={GREEN_DARK} strokeWidth={1.3} fill="none" />
      <Path d={`M ${x2 + 10} ${y2 - 5} L ${x2 + 10} ${y2 + 5} L ${x2} ${y2} Z`} fill={GREEN_DARK} />
      <Text style={{ position: "absolute", left: bulge - 60, top: (y1 + y2) / 2 - 6, width: 120, fontSize: 6.6, color: GREEN_DARK, textAlign: "center" }}>{label}</Text>
    </>
  );
}

// Curva à esquerda (atalho especial de cancelamento), cor âmbar
function ShortcutArrow({ fromKey, toKey, label }: { fromKey: string; toKey: string; label: string }) {
  const a = boxByKey(fromKey);
  const b = boxByKey(toKey);
  const x1 = a.left;
  const y1 = a.y;
  const x2 = b.left;
  const y2 = b.y;
  const bulge = x1 - 150;
  return (
    <>
      <Path d={`M ${x1} ${y1} C ${bulge} ${y1}, ${bulge} ${y2}, ${x2 - 10} ${y2}`} stroke={AMBER} strokeWidth={1.3} fill="none" strokeDasharray="4,3" />
      <Path d={`M ${x2 - 10} ${y2 - 5} L ${x2 - 10} ${y2 + 5} L ${x2} ${y2} Z`} fill={AMBER} />
      <Text style={{ position: "absolute", left: bulge - 60, top: (y1 + y2) / 2 - 6, width: 120, fontSize: 6.6, color: AMBER, textAlign: "center" }}>{label}</Text>
    </>
  );
}

// Seta para o box de Cancelado, cor vermelha
function CancelArrow({ fromKey, label }: { fromKey: string; label: string }) {
  const a = boxByKey(fromKey);
  const x1 = a.right;
  const y1 = a.y;
  const x2 = CANC_X;
  const y2 = CANC_Y + (y1 < CANC_Y ? -18 : y1 > CANC_Y ? 18 : 0);
  const bulge = x1 + 70;
  return (
    <>
      <Path d={`M ${x1} ${y1} C ${bulge} ${y1}, ${bulge} ${y2}, ${x2 - 8} ${y2}`} stroke={DANGER} strokeWidth={1.1} fill="none" />
      <Path d={`M ${x2 - 8} ${y2 - 4} L ${x2 - 8} ${y2 + 4} L ${x2} ${y2} Z`} fill={DANGER} />
      <Text style={{ position: "absolute", left: x1 + 6, top: y1 - 14, width: 90, fontSize: 6.2, color: DANGER }}>{label}</Text>
    </>
  );
}

// Laço (permanece na mesma etapa), pequeno arco à esquerda da caixa
function SelfLoop({ stageKey }: { stageKey: string }) {
  const a = boxByKey(stageKey);
  const x = a.left;
  const y = a.y;
  return (
    <Path
      d={`M ${x} ${y - 14} C ${x - 34} ${y - 24}, ${x - 34} ${y + 24}, ${x} ${y + 14}`}
      stroke={AMBER}
      strokeWidth={1.2}
      fill="none"
    />
  );
}

function StageBoxView({ box }: { box: StageBox }) {
  return (
    <>
      <Rect x={MAIN_X} y={box.y - BOX_H / 2} width={BOX_W} height={BOX_H} rx={6} fill={WHITE} stroke={BLACK} strokeWidth={1.1} />
      <Text style={{ position: "absolute", left: MAIN_X + 10, top: box.y - BOX_H / 2 + (box.sub ? 8 : 20), width: BOX_W - 20, fontSize: 8.6, fontWeight: 700, color: BLACK, textAlign: "center" }}>
        {box.label}
      </Text>
      {box.sub && (
        <Text style={{ position: "absolute", left: MAIN_X + 10, top: box.y - BOX_H / 2 + 34, width: BOX_W - 20, fontSize: 6.6, color: AMBER, textAlign: "center" }}>
          {box.sub}
        </Text>
      )}
    </>
  );
}

function DiagramPage() {
  return (
    <Page size={[DIA_W, DIA_H]} style={{ backgroundColor: WHITE, fontFamily: "Montserrat" }}>
      <View style={{ position: "absolute", top: 30, left: 40, right: 40 }}>
        <Text style={{ fontSize: 16, fontWeight: 700, color: BLACK }}>Diagrama completo: Solicitação de Compras</Text>
        <Text style={{ fontSize: 9, color: MUTED, marginTop: 4 }}>
          Máquina de estados completa. 16 etapas, todos os desvios condicionais, laços e atalhos de cancelamento. Fonte: src/lib/workflow.ts e as rotas de API de cada etapa.
        </Text>
      </View>

      {/* Legenda */}
      <View style={{ position: "absolute", top: 78, left: 40, flexDirection: "row", gap: 18 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Svg width={20} height={8}><Line x1={0} y1={4} x2={20} y2={4} stroke={BLACK} strokeWidth={1.5} /></Svg>
          <Text style={{ fontSize: 7.5, color: INK_SOFT }}>Fluxo padrão</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Svg width={20} height={8}><Line x1={0} y1={4} x2={20} y2={4} stroke={GREEN_DARK} strokeWidth={1.3} /></Svg>
          <Text style={{ fontSize: 7.5, color: INK_SOFT }}>Ramificação (pula etapas)</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Svg width={20} height={8}><Line x1={0} y1={4} x2={20} y2={4} stroke={AMBER} strokeWidth={1.3} strokeDasharray="4,3" /></Svg>
          <Text style={{ fontSize: 7.5, color: INK_SOFT }}>Atalho de cancelamento / laço</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Svg width={20} height={8}><Line x1={0} y1={4} x2={20} y2={4} stroke={DANGER} strokeWidth={1.3} /></Svg>
          <Text style={{ fontSize: 7.5, color: INK_SOFT }}>Vai para Cancelado</Text>
        </View>
      </View>

      <Svg width={DIA_W} height={DIA_H} style={{ position: "absolute", top: 0, left: 0 }}>
        {/* setas retas: fluxo padrão */}
        <StraightArrow fromKey="SOLICITACAO" toKey="TRIAGEM" />
        <StraightArrow fromKey="TRIAGEM" toKey="VALIDACAO_ORCAMENTARIA" />
        <StraightArrow fromKey="VALIDACAO_ORCAMENTARIA" toKey="DUE_DILIGENCE" />
        <StraightArrow fromKey="DUE_DILIGENCE" toKey="COTACAO" />
        <StraightArrow fromKey="COTACAO" toKey="MAPA_COTACAO" />
        <StraightArrow fromKey="MAPA_COTACAO" toKey="APROVACAO" />
        <StraightArrow fromKey="APROVACAO" toKey="JURIDICO" />
        <StraightArrow fromKey="JURIDICO" toKey="PEDIDO_COMPRA" />
        <StraightArrow fromKey="PEDIDO_COMPRA" toKey="AGUARDANDO_ENTREGA" />
        <StraightArrow fromKey="AGUARDANDO_ENTREGA" toKey="MEDICAO" />
        <StraightArrow fromKey="MEDICAO" toKey="FISCAL" />
        <StraightArrow fromKey="FISCAL" toKey="TESOURARIA" />
        <StraightArrow fromKey="TESOURARIA" toKey="MAPEAMENTO_CONTRATO" />
        <StraightArrow fromKey="MAPEAMENTO_CONTRATO" toKey="CONCLUIDO" />

        {/* ramificações verdes: pulam etapas dentro do sucesso */}
        <SkipArrow fromKey="VALIDACAO_ORCAMENTARIA" toKey="COTACAO" label="Sem due diligence (não é ferramenta nova)" />
        <SkipArrow fromKey="APROVACAO" toKey="PEDIDO_COMPRA" label="Não exige contrato" />
        <SkipArrow fromKey="AGUARDANDO_ENTREGA" toKey="MAPEAMENTO_CONTRATO" label="Sem medição, gera contrato" />
        <SkipArrow fromKey="AGUARDANDO_ENTREGA" toKey="CONCLUIDO" label="Sem medição, sem contrato" />
        <SkipArrow fromKey="TESOURARIA" toKey="CONCLUIDO" label="Sem mapeamento de contrato" />

        {/* atalhos âmbar: cancelamento (demandType=CANCELAMENTO) */}
        <ShortcutArrow fromKey="TRIAGEM" toKey="JURIDICO" label="Cancelamento de contrato, serviço ou ferramenta" />
        <ShortcutArrow fromKey="JURIDICO" toKey="CONCLUIDO" label="Cancelamento assinado" />

        {/* laços: permanece na mesma etapa */}
        <SelfLoop stageKey="VALIDACAO_ORCAMENTARIA" />
        <SelfLoop stageKey="MEDICAO" />
        <SelfLoop stageKey="FISCAL" />

        {/* setas vermelhas: vão para Cancelado */}
        <CancelArrow fromKey="TRIAGEM" label="Reprovado" />
        <CancelArrow fromKey="VALIDACAO_ORCAMENTARIA" label="Exceção reprovada" />
        <CancelArrow fromKey="DUE_DILIGENCE" label="Reprovado" />
        <CancelArrow fromKey="APROVACAO" label="Reprovado" />

        {/* caixas de etapa */}
        {STAGE_BOXES.map((b) => <StageBoxView key={b.key} box={b} />)}

        {/* caixa Cancelado */}
        <Rect x={CANC_X} y={CANC_Y - CANC_H / 2} width={CANC_W} height={CANC_H} rx={6} fill={DANGER} />
        <Text style={{ position: "absolute", left: CANC_X, top: CANC_Y - 10, width: CANC_W, fontSize: 10.5, fontWeight: 700, color: WHITE, textAlign: "center" }}>
          CANCELADO
        </Text>
        <Text style={{ position: "absolute", left: CANC_X, top: CANC_Y + 5, width: CANC_W, fontSize: 6.8, color: "rgba(255,255,255,0.85)", textAlign: "center" }}>
          terminal, sem novas ações
        </Text>
      </Svg>

      <View style={{ position: "absolute", bottom: 30, left: 40, right: 40, borderTop: `0.5pt solid ${BORDER}`, paddingTop: 8 }}>
        <Text style={{ fontSize: 7, color: MUTED }}>
          Não representado neste diagrama (ver seção "Override administrativo"): um ADMIN pode mover uma solicitação para qualquer etapa, em qualquer direção, sem revalidar nenhuma regra. É um mecanismo de exceção, fora do fluxo normal.
        </Text>
      </View>
    </Page>
  );
}

const TODAY = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

export function AuditoriaSistemaDocument() {
  return (
    <Document>
      {/* Capa */}
      <Page size="A4" style={styles.cover}>
        {ASSETS.wordmarkWhite && <Image style={styles.coverWordmark} src={{ data: ASSETS.wordmarkWhite, format: "png" }} />}
        <Text style={styles.coverKicker}>DOCUMENTO DE AUDITORIA, USO INTERNO</Text>
        <Text style={styles.coverTitle}>Mapa Funcional Completo{"\n"}do Sistema</Text>
        <Text style={styles.coverSystem}>alAi</Text>
        <Text style={styles.coverSubtitle}>
          Referência técnica exaustiva com cada etapa, cada condição de ramificação, cada papel envolvido e cada
          inconsistência encontrada no código-fonte. Cobre Solicitação de Compras, Viagens Acerto, Facilities, NDA e
          Contratos de Fornecedores, gestão de Contratos, controle de acesso, configurações administrativas,
          dashboards, IA e notificações.
        </Text>
        <Text style={styles.coverDate}>Gerado em {TODAY}. Confidencial, uso interno Acerto.</Text>
      </Page>

      {/* Sumário */}
      <Page size="A4" style={styles.page}>
        <RunningHeader label="Mapa Funcional Completo" />
        <Footer />
        <View style={styles.sectionBlock} bookmark={{ title: "Sumário" }}>
          <View style={styles.h1Bar} />
          <Text style={styles.h1}>Sumário</Text>
          {[
            "1. Como usar este documento",
            "2. Diagrama completo: máquina de estados",
            "3. Solicitação de Compras, etapa por etapa (16 etapas)",
            "4. Override administrativo (break-glass)",
            "5. Regras transversais, números exatos",
            "6. Chamados simples (Viagens, Facilities, NDA)",
            "7. Contratos",
            "8. Controle de acesso (RBAC)",
            "9. Configurações administrativas",
            "10. Dashboards",
            "11. Recursos de IA: o que decide e o que não decide",
            "12. Notificações: e-mail e Slack",
            "13. Achados para auditoria (16 pontos de atenção)",
          ].map((line) => (
            <View key={line} style={styles.toc}>
              <Text style={styles.tocText}>{line}</Text>
            </View>
          ))}
        </View>

        <H1 bookmark="1. Como usar este documento">1. Como usar este documento</H1>
        <P>
          Este documento é a contraparte técnica do Manual do Processo (o guia de uso amigável). Aqui, cada
          afirmação é rastreável ao código-fonte real: arquivo e linha aparecem ao final de cada bloco. Onde uma
          regra existe apenas como comentário ou intenção documentada, mas não é de fato aplicada no código, isso
          está sinalizado explicitamente. Não confunda o que está{" "}
          <Text style={{ fontWeight: 700 }}>documentado</Text> com o que está de fato{" "}
          <Text style={{ fontWeight: 700 }}>em vigor</Text>.
        </P>
        <P>
          A seção 13 (Achados para auditoria) reúne, de forma consolidada, os 16 pontos que mais chamam atenção pra
          quem for revisar o sistema. Vale começar por ali antes de entrar no detalhamento etapa por etapa.
        </P>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Legenda de severidade usada na seção 13</Text>
          <Text style={styles.cardLine}><Text style={{ color: DANGER, fontWeight: 700 }}>R</Text>: regra não aplicada. Documentada ou esperada, mas não é de fato imposta pelo código.</Text>
          <Text style={styles.cardLine}><Text style={{ color: AMBER, fontWeight: 700 }}>D</Text>: inconsistência de documentação ou mensagem. O comportamento real diverge do texto exibido ou comentado.</Text>
          <Text style={styles.cardLine}><Text style={{ color: GREEN_DARK, fontWeight: 700 }}>A</Text>: lacuna de superfície administrativa. Falta tela ou rota pra operar algo que já existe no modelo de dados.</Text>
          <Text style={styles.cardLine}><Text style={{ color: BLACK, fontWeight: 700 }}>S</Text>: ponto de atenção de segurança ou robustez.</Text>
        </View>
      </Page>

      {/* Diagrama completo: página pôster */}
      <DiagramPage />

      {/* Etapa por etapa */}
      <Page size="A4" style={styles.page}>
        <RunningHeader label="Solicitação de Compras, etapa por etapa" />
        <Footer />
        <H1 bookmark="3. Solicitação de Compras, etapa por etapa">3. Solicitação de Compras, etapa por etapa</H1>
        <P>
          Nem toda solicitação passa por todas as 15 etapas. O desvio exato depende do tipo de demanda, do valor
          estimado e das aprovações. Abaixo, cada etapa com quem age, o que dispara a entrada, todos os caminhos de
          saída e os efeitos colaterais reais (e-mail, Slack, registros criados).
        </P>

        <StageCard
          n={1} title="Solicitação de Compra" role="Solicitante"
          trigger="Envio do formulário Nova Solicitação. O código é gerado como PC-{ano}-{sequência}."
          branches={[
            "Avança automaticamente para Homologação e Triagem assim que criada. Esta etapa é transitória, nunca fica parada aqui.",
          ]}
          effects={["Notificação de confirmação de recebimento por e-mail ao solicitante", "Slack DM informativo a todos os gestores do centro de custo, não só o principal"]}
          file="src/app/api/requests/route.ts (POST)"
        />
        <StageCard
          n={2} title="Homologação e Triagem" role="Comprador"
          trigger="Aprovação do gestor concedida."
          branches={[
            "Ação Devolver: permanece em Triagem, com um comentário registrado, sem mudança de etapa.",
            "Tipo de demanda igual a Cancelamento: vai direto para Jurídico, pulando Orçamento, Cotação, Aprovação e Pedido de Compra.",
            "Nos demais casos: segue para Validação Orçamentária, depois de calcular a faixa de risco (lane) e o sinalizador de fracionamento.",
          ]}
          effects={[
            "Exige valor estimado antes de prosseguir, se ainda não informado",
            "E-mail de atualização de etapa ao solicitante",
            "Se fracionamento é detectado, cria um registro de notificação, mas não dispara e-mail ou Slack de fato (ver achado 3)",
          ]}
          file="src/app/api/requests/[id]/triagem/route.ts"
        />
        <StageCard
          n={3} title="Validação Orçamentária" role="Comprador. Exceção: Coordenação ou Gerente F&NC"
          trigger="Saída da Triagem."
          branches={[
            "Orçamento OK e Ferramenta Nova: segue para Due Diligence.",
            "Orçamento OK e qualquer outro tipo, inclusive Upgrade ou Downgrade: segue para Cotação.",
            "Sem orçamento: entra em exceção orçamentária, permanece na própria etapa até uma decisão.",
            "Exceção reprovada: vai para Cancelado. Exceção aprovada: segue a mesma lógica de roteamento acima.",
          ]}
          effects={["E-mail de atualização de etapa só no caminho direto com orçamento OK. A exceção aprovada não dispara este e-mail", "Anexa automaticamente o comprovante de Orçamento Extra à exceção, quando existe"]}
          file="src/app/api/requests/[id]/validacao-orcamentaria/route.ts"
        />
        <StageCard
          n={4} title="Due Diligence (Privacidade)" role="Privacidade"
          trigger="Ferramenta nova aprovada no orçamento."
          branches={["Aprovado: segue para Cotação.", "Reprovado: vai para Cancelado, com motivo padrão \"Reprovado em Due Diligence\" se não informado."]}
          effects={["E-mail de atualização de etapa, na aprovação, ou de reprovação"]}
          file="src/app/api/requests/[id]/due-diligence/route.ts"
        />
        <StageCard
          n={5} title="Cotação" role="Comprador"
          trigger="Orçamento validado, com ou sem due diligence."
          branches={["Mínimo de propostas atingido (1 se até R$2.500, 3 acima disso): segue para Mapa de Cotação."]}
          effects={["Uma chamada por fornecedor cotado", "E-mail de atualização de etapa ao avançar"]}
          file="src/app/api/requests/[id]/cotacao/route.ts"
        />
        <StageCard
          n={6} title="Mapa de Cotação" role="Comprador"
          trigger="Número mínimo de cotações atingido."
          branches={["Fornecedor vencedor selecionado: segue para Aprovação."]}
          effects={["E-mail de atualização de etapa"]}
          file="src/app/api/requests/[id]/mapa-cotacao/route.ts"
        />
        <StageCard
          n={7} title="Aprovação" role="Aprovador (pool por alçada)"
          trigger="Fornecedor selecionado no Mapa de Cotação."
          branches={[
            "Exige declaração de conflito de interesse, sem conflito, antes de criar a aprovação.",
            "Nível 1, até R$50 mil: 1 aprovador decide. Níveis 2 e 3, acima disso: exige 2 aprovadores distintos, uma dupla checagem. Se algum ainda estiver pendente, a solicitação não avança.",
            "Aprovado, exigindo contrato: segue para Jurídico. Aprovado sem contrato: segue para Pedido de Compra.",
            "Reprovado por qualquer aprovador do lote: vai para Cancelado, mesmo que outro já tenha aprovado.",
          ]}
          effects={[
            "Prazo de decisão de 3 dias corridos, apesar do nome da constante dizer dias úteis (ver achado 5)",
            "E-mail de aprovado ou reprovado",
            "Aviso por Slack quando alguém decide em nome de outro (personificação)",
          ]}
          file="src/app/api/requests/[id]/aprovacao/route.ts"
        />
        <StageCard
          n={8} title="Jurídico" role="Jurídico"
          trigger="Aprovação concluída com exigência de contrato, ou atalho de Cancelamento vindo da Triagem."
          branches={[
            "Contrato assinado e tipo Cancelamento: vai direto para Concluído, pulando Pedido de Compra.",
            "Contrato assinado e qualquer outro tipo: segue para Pedido de Compra.",
            "Ainda não assinado: permanece em Jurídico.",
          ]}
          effects={["E-mail de atualização de etapa"]}
          file="src/app/api/requests/[id]/juridico/route.ts"
        />
        <StageCard
          n={9} title="Pedido de Compra" role="Comprador"
          trigger="Revisão jurídica concluída, ou aprovação sem exigência de contrato."
          branches={["Emissão do PDF oficial: segue para Aguardando Entrega ou Conclusão."]}
          effects={["Gera e salva o PDF do Pedido de Compra no sistema de arquivos local", "E-mail com o link do PDF"]}
          file="src/app/api/requests/[id]/pedido-compra/route.tsx"
        />
        <StageCard
          n={10} title="Aguardando Entrega/Conclusão" role="Comprador"
          trigger="Pedido de Compra emitido."
          branches={[
            "Exige medição: segue para Medição, que tem prioridade sobre mapeamento quando ambos são verdadeiros.",
            "Sem medição, mas gera contrato: segue para Mapeamento de Contrato.",
            "Sem medição e sem contrato: vai para Concluído.",
          ]}
          effects={["E-mail de atualização de etapa"]}
          file="src/app/api/requests/[id]/aguardando-entrega/route.ts"
        />
        <StageCard
          n={11} title="Medição e Aprovação Financeira" role="Comprador"
          trigger="Compra exige medição, por exemplo serviços recorrentes ou obras."
          branches={["Aprovado tecnicamente: segue para Validação Fiscal.", "Reprovado ou pendente: permanece em Medição. Não há caminho de cancelamento aqui."]}
          effects={["E-mail de atualização de etapa ao avançar"]}
          file="src/app/api/requests/[id]/medicao/route.ts"
        />
        <StageCard
          n={12} title="Validação Fiscal" role="Fiscal"
          trigger="Medição aprovada."
          branches={["Documento aprovado: segue para Tesouraria.", "Documento reprovado: permanece em Validação Fiscal. Não há caminho de cancelamento."]}
          effects={["E-mail de atualização de etapa ao avançar"]}
          file="src/app/api/requests/[id]/fiscal/route.ts"
        />
        <StageCard
          n={13} title="Tesouraria (Pagamento)" role="Tesouraria"
          trigger="Documento fiscal aprovado."
          branches={["ERP confirma o pagamento e gera contrato: segue para Mapeamento de Contrato.", "ERP confirma o pagamento, sem contrato: vai para Concluído."]}
          effects={["E-mail de atualização de etapa"]}
          file="src/app/api/requests/[id]/tesouraria/route.ts"
        />
        <StageCard
          n={14} title="Mapeamento de Contrato" role="Comprador"
          trigger="Pagamento confirmado, ou saída direta de Aguardando Entrega, quando a compra gera contrato vigente."
          branches={["Contrato cadastrado: vai para Concluído."]}
          effects={["Cria o registro de Contrato, que alimenta a área de Contratos", "E-mail de atualização de etapa"]}
          file="src/app/api/requests/[id]/mapeamento-contrato/route.ts"
        />
        <StageCard
          n={15} title="Concluído" role="Nenhum"
          trigger="Fim do fluxo, por qualquer um dos caminhos acima."
          branches={["Terminal. A única ação permitida é o registro de Avaliação (NPS de 0 a 10), que é só informativo e não afeta mais nada."]}
          effects={[]}
          file="src/app/api/requests/[id]/avaliacao/route.ts"
        />
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cancelado, terminal</Text>
          <Text style={styles.cardLine}>Nenhuma ação adicional definida. Alcançável a partir de Triagem, Validação Orçamentária (exceção reprovada), Due Diligence e Aprovação.</Text>
        </View>
      </Page>

      {/* Override administrativo */}
      <Page size="A4" style={styles.page}>
        <RunningHeader label="Override administrativo" />
        <Footer />
        <H1 bookmark="4. Override administrativo (break-glass)">4. Override administrativo (break-glass)</H1>
        <P>
          Existe um mecanismo de exceção total. Um ADMIN pode mover qualquer solicitação para qualquer etapa do
          enum, pra frente ou pra trás, sem que nenhuma regra de negócio da etapa de destino seja reverificada e
          sem reenviar nenhum efeito colateral (e-mail ou Slack) da etapa. Fica registrado no histórico com um
          comentário que distingue se foi avanço ou retrocesso, sem validações da etapa.
        </P>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Ponto de atenção</Text>
          <Text style={styles.cardLine}>
            O status da solicitação (Aberto, Cancelado, Concluído) é recalculado de forma simplificada, só com base
            na etapa de destino. Mover uma solicitação Cancelada ou Concluída de volta pra qualquer etapa
            intermediária a reabre automaticamente como Aberto, mesmo que as condições originais de cancelamento
            ou conclusão nunca tenham sido revertidas de fato.
          </Text>
        </View>
        <Text style={styles.mono}>src/app/api/requests/[id]/stage-override/route.ts</Text>

        <H1 bookmark="5. Regras transversais, números exatos">5. Regras transversais, números exatos</H1>
        <H2>Faixas de risco (lanes)</H2>
        <View style={styles.table}>
          <View style={styles.trHead}>
            <Text style={[styles.th, { width: 80 }]}>Faixa</Text>
            <Text style={[styles.th, { flex: 1 }]}>Condição exata</Text>
          </View>
          <View style={styles.tr}>
            <Text style={[styles.td, styles.tdStrong, { width: 80 }]}>Fast</Text>
            <Text style={[styles.td, { flex: 1 }]}>Valor até R$5 mil, fornecedor já homologado e risco baixo.</Text>
          </View>
          <View style={styles.tr}>
            <Text style={[styles.td, styles.tdStrong, { width: 80 }]}>Standard</Text>
            <Text style={[styles.td, { flex: 1 }]}>Dado pessoal ou ferramenta nova, sem ultrapassar R$500 mil, ou qualquer caso que não se enquadre em Fast nem Strategic.</Text>
          </View>
          <View style={styles.tr}>
            <Text style={[styles.td, styles.tdStrong, { width: 80 }]}>Strategic</Text>
            <Text style={[styles.td, { flex: 1 }]}>Valor acima de R$500 mil, ou fornecedor de risco alto, ou (dado pessoal ou ferramenta nova) acima de R$500 mil.</Text>
          </View>
        </View>

        <H2>Alçadas de Aprovação (etapa Aprovação)</H2>
        <View style={styles.table}>
          <View style={styles.trHead}>
            <Text style={[styles.th, { width: 45 }]}>Nível</Text>
            <Text style={[styles.th, { width: 100 }]}>Valor</Text>
            <Text style={[styles.th, { flex: 1 }]}>Aprovadores exigidos</Text>
          </View>
          <View style={styles.tr}>
            <Text style={[styles.td, styles.tdStrong, { width: 45 }]}>1</Text>
            <Text style={[styles.td, { width: 100 }]}>Até R$50 mil</Text>
            <Text style={[styles.td, { flex: 1 }]}>1 aprovador do pool configurado para o nível</Text>
          </View>
          <View style={styles.tr}>
            <Text style={[styles.td, styles.tdStrong, { width: 45 }]}>2</Text>
            <Text style={[styles.td, { width: 100 }]}>Até R$500 mil</Text>
            <Text style={[styles.td, { flex: 1 }]}>2 aprovadores distintos, dupla checagem</Text>
          </View>
          <View style={styles.tr}>
            <Text style={[styles.td, styles.tdStrong, { width: 45 }]}>3</Text>
            <Text style={[styles.td, { width: 100 }]}>Acima de R$500 mil</Text>
            <Text style={[styles.td, { flex: 1 }]}>2 aprovadores distintos, dupla checagem. Não há papel de CEO no código</Text>
          </View>
        </View>

        <H2>Exceção Orçamentária (etapa Validação Orçamentária, quando não há saldo)</H2>
        <View style={styles.table}>
          <View style={styles.trHead}>
            <Text style={[styles.th, { width: 45 }]}>Nível</Text>
            <Text style={[styles.th, { width: 100 }]}>Valor</Text>
            <Text style={[styles.th, { flex: 1 }]}>Quem decide</Text>
          </View>
          <View style={styles.tr}>
            <Text style={[styles.td, styles.tdStrong, { width: 45 }]}>1</Text>
            <Text style={[styles.td, { width: 100 }]}>Até R$10 mil</Text>
            <Text style={[styles.td, { flex: 1 }]}>Coordenação</Text>
          </View>
          <View style={styles.tr}>
            <Text style={[styles.td, styles.tdStrong, { width: 45 }]}>2</Text>
            <Text style={[styles.td, { width: 100 }]}>Acima de R$10 mil</Text>
            <Text style={[styles.td, { flex: 1 }]}>Gerente F&amp;NC. Sem CEO</Text>
          </View>
        </View>

        <H2>Outras regras com número exato</H2>
        <Bullet><Text style={styles.cardLabel}>Cotações mínimas: </Text>1 proposta até R$2.500. 3 propostas acima disso.</Bullet>
        <Bullet><Text style={styles.cardLabel}>Anti-fracionamento: </Text>soma o valor de todas as solicitações do mesmo fornecedor nos últimos 12 meses e sinaliza a Controladoria se a soma ultrapassar uma alçada que o valor individual sozinho não atingiria. Apenas detecta e sinaliza, não bloqueia a solicitação.</Bullet>
        <Bullet><Text style={styles.cardLabel}>Personificação (comprador): </Text>só permitida no Nível 1 de alçada, até R$50 mil. Um ADMIN personifica em qualquer nível e etapa, sem teto.</Bullet>
        <Bullet><Text style={styles.cardLabel}>Conflito de interesse: </Text>obrigatório declarar (sem conflito) antes de criar qualquer Aprovação. Bloqueia se houver conflito declarado.</Bullet>
        <Bullet><Text style={styles.cardLabel}>Escalonamento: </Text>3 dias sem decisão do aprovador dispara um lembrete automático por Slack ao aprovador e à Controladoria, via rotina agendada. Apenas avisa, nunca decide ou pula a etapa sozinho.</Bullet>
        <Bullet><Text style={styles.cardLabel}>Orçamento Extra: </Text>a opção Orçamento Extra no formulário exige, na interface, anexar o comprovante de validação do FP&amp;A antes de enviar. Essa obrigatoriedade não é reforçada na API (ver achado 8).</Bullet>
        <Bullet><Text style={styles.cardLabel}>Alinhamento com a liderança (Sim/Não): </Text>campo obrigatório no formulário, mas puramente informativo. Nenhuma etapa ou regra usa esse valor para decidir algo. Só aparece no histórico e gera um aviso ao solicitante quando marca Não.</Bullet>
      </Page>

      {/* Chamados, Contratos, RBAC */}
      <Page size="A4" style={styles.page}>
        <RunningHeader label="Chamados, Contratos e Acesso" />
        <Footer />
        <H1 bookmark="6. Chamados simples (Viagens, Facilities, NDA)">6. Chamados simples (Viagens, Facilities, NDA)</H1>
        <P>
          Fluxo enxuto e idêntico nas três categorias. A única diferença real são os campos extras específicos de
          Cadastros, Contratos de Fornecedores e NDA, ligados a fornecedor ou contrato. Não passa pelas alçadas, orçamento ou
          aprovações da Solicitação de Compras: é, de propósito, fora desse processo.
        </P>
        <Bullet><Text style={styles.cardLabel}>Abertura: </Text>qualquer pessoa com e-mail @acerto.com.br, sem exigir vínculo com usuário cadastrado. Nome e e-mail em texto livre.</Bullet>
        <Bullet><Text style={styles.cardLabel}>Status: </Text>Aberto, Em Andamento, Concluído. Só quem tem acesso ao quadro (Admin, Comprador, Aprovador ou Controladoria) muda o status.</Bullet>
        <Bullet><Text style={styles.cardLabel}>Mensagens: </Text>quem tem acesso ao quadro ou o próprio solicitante, validado por e-mail, pode responder. Toda mensagem nova dispara e-mail ao solicitante, de qualquer autor.</Bullet>
        <Bullet><Text style={styles.cardLabel}>Anexos: </Text>o endpoint de anexo aceita qualquer chamada sem checar se quem está anexando é o solicitante ou tem acesso ao quadro (ver achado 14).</Bullet>

        <H1 bookmark="7. Contratos">7. Contratos</H1>
        <Bullet><Text style={styles.cardLabel}>Duas origens: </Text>gerado automaticamente ao concluir Mapeamento de Contrato numa solicitação, ou importado avulso e legado via planilha, sem vínculo com solicitação.</Bullet>
        <Bullet><Text style={styles.cardLabel}>Cancelamento: </Text>exige confirmação explícita de que a Tesouraria foi avisada antes de cancelar, uma proteção contra pagamento recorrente de um contrato já cancelado. Notifica a Tesouraria por e-mail e Slack.</Bullet>
        <Bullet><Text style={styles.cardLabel}>Alerta de renovação: </Text>rotina agendada avisa 3 meses antes do vencimento, por e-mail e Slack ao gestor do contrato. O dashboard também mostra, à parte, contratos vencendo em 60, 30 ou 10 dias.</Bullet>
        <Bullet><Text style={styles.cardLabel}>Importação em massa: </Text>planilha com modelo fixo. Linhas com erro são reportadas individualmente, sem invalidar o lote inteiro. Exige que o e-mail do gestor já exista como usuário cadastrado.</Bullet>

        <H1 bookmark="8. Controle de acesso (RBAC)">8. Controle de acesso (RBAC)</H1>
        <Bullet><Text style={styles.cardLabel}>11 papéis: </Text>Solicitante, Comprador, Aprovador, Jurídico, Tesouraria, Controladoria, Privacidade, Fiscal, Admin, Coordenação, Gerente F&amp;NC. Não existe papel de CEO.</Bullet>
        <Bullet><Text style={styles.cardLabel}>Acesso ao quadro (Solicitações, Contratos, Dashboards): </Text>Admin, Comprador, Aprovador ou Controladoria. Solicitante sozinho não vê.</Bullet>
        <Bullet><Text style={styles.cardLabel}>Login: </Text>Google restrito a @acerto.com.br. O primeiro acesso cria o usuário automaticamente só com o papel Solicitante. Qualquer papel adicional só é concedido manualmente por um Admin.</Bullet>
        <Bullet><Text style={styles.cardLabel}>Desativação: </Text>soft-delete. O usuário fica inativo e todo o histórico é preservado. Nada é apagado de fato.</Bullet>
        <Bullet><Text style={styles.cardLabel}>Admin é bypass universal: </Text>qualquer verificação de papel numa ação de etapa passa automaticamente para quem tem o papel Admin.</Bullet>
      </Page>

      {/* Admin, Dashboards, IA, Notificações */}
      <Page size="A4" style={styles.page}>
        <RunningHeader label="Admin, Dashboards, IA e Notificações" />
        <Footer />
        <H1 bookmark="9. Configurações administrativas">9. Configurações administrativas</H1>
        <Bullet><Text style={styles.cardLabel}>Centros de Custo: </Text>criação, gestores (múltiplos por centro), ativar ou desativar. Trocar os gestores migra automaticamente as aprovações ainda pendentes desse centro para o novo gestor principal. Decisões já tomadas ficam intocadas.</Bullet>
        <Bullet><Text style={styles.cardLabel}>Alçadas de Aprovação: </Text>pool de aprovadores por nível (1, 2 ou 3). Trocar o pool migra aprovações pendentes daquele nível para o novo aprovador principal, e nunca mexe em aprovações já decididas.</Bullet>
        <Bullet><Text style={styles.cardLabel}>Por Aprovador: </Text>visão inversa, escolhe, por pessoa aprovadora, quais centros de custo ela pode decidir. É a mesma relação de dados de Centros de Custo, só outro ângulo de tela.</Bullet>
        <Bullet><Text style={styles.cardLabel}>Acessos: </Text>gerencia só 5 dos 11 papéis (Admin, Comprador, Solicitante, Aprovador e Controladoria). Os outros 6 (Tesouraria, Fiscal, Jurídico, Privacidade, Coordenação, Gerente F&amp;NC) só aparecem pra filtro, sem botão de conceder ou revogar (ver achado 13).</Bullet>

        <H1 bookmark="10. Dashboards">10. Dashboards</H1>
        <P>Uma única função central calcula tudo que aparece na tela, na exportação Excel e na exportação PDF, garantindo que o exportado é exatamente o que está na tela.</P>
        <Bullet>KPIs com variação em relação ao período anterior: gasto total, número de solicitações, número de pedidos de compra, ciclo médio, economia total e percentual, percentual de SLA cumprido, fornecedores ativos.</Bullet>
        <Bullet>Evolução mensal (12 meses), ranking de fornecedores (nota de confiabilidade de 0 a 100, documentada como proxy interno, não uma certificação de mercado), ranking de compradores, funil por etapa, histograma de tempo de ciclo, mapa de sazonalidade.</Bullet>
        <Bullet>Mapa de risco: concentração num único fornecedor, urgências críticas, compras sem contrato mapeado, atrasos de SLA, fornecedores de risco alto, fracionamentos sinalizados, exceções orçamentárias pendentes, decisões personificadas.</Bullet>
        <Bullet>Alertas inteligentes, todos calculados em cima de dado real, sem número inventado: contratos a vencer, economia abaixo da meta (só dispara se a meta estiver configurada), SLA de um comprador muito abaixo da média do time, fornecedor sem avaliação NPS, concentração de fornecedor acima de 40%.</Bullet>

        <H1 bookmark="11. Recursos de IA: o que decide e o que não decide">11. Recursos de IA: o que decide e o que não decide</H1>
        <P><Text style={{ fontWeight: 700 }}>Confirmado: nenhuma etapa do fluxo usa resposta de IA como condição de avanço.</Text> Todo uso é assistivo: sugere, resume, aponta risco. A decisão final é sempre de uma pessoa.</P>
        <Bullet><Text style={styles.cardLabel}>Sugerir com IA (Nova Solicitação): </Text>classifica o texto livre em tipo de demanda e prioridade, sinaliza provável Due Diligence. Nada é preenchido sem clique, tudo continua editável.</Bullet>
        <Bullet><Text style={styles.cardLabel}>Painel de insight por etapa: </Text>Triagem, Due Diligence, Cotação e Mapa de Cotação (com síntese comparativa a partir de 3 ou mais cotações), Jurídico, Aprovação (resumo executivo) e Mapeamento de Contrato. Cada um com aviso explícito de que não substitui a análise humana.</Bullet>
        <Bullet><Text style={styles.cardLabel}>Histórico de fornecedor (12 meses): </Text>não é IA. É uma consulta SQL determinística que alimenta o alerta de fracionamento.</Bullet>
        <Bullet><Text style={styles.cardLabel}>Chaves de API: </Text>cada pessoa usa sua própria chave, Anthropic ou Gemini, criptografada em repouso. Nunca uma chave única do sistema inteiro.</Bullet>

        <H1 bookmark="12. Notificações: e-mail e Slack">12. Notificações: e-mail e Slack</H1>
        <P>Toda tentativa de notificação grava um registro, de sucesso ou de falha. Nenhuma etapa do workflow é bloqueada por falha de e-mail ou Slack.</P>
        <Bullet><Text style={styles.cardLabel}>E-mails: </Text>confirmação de recebimento, atualização de etapa (genérico, dispara na maioria das transições), reprovado, aprovado, pedido de compra gerado, chamado aberto, nova mensagem em chamado, alerta de renovação de contrato.</Bullet>
        <Bullet><Text style={styles.cardLabel}>Nota histórica: </Text>a assimetria de e-mail (havia aviso de reprovação, não de aprovação) era da etapa Aprovação do Gestor, removida do fluxo em 21/08/2026.</Bullet>
        <Bullet><Text style={styles.cardLabel}>Slack: </Text>aviso de nova solicitação a todos os gestores do centro de custo, disclosure de decisão personificada, lembrete de escalonamento ao aprovador e à Controladoria, alerta de renovação de contrato, aviso de cancelamento de contrato à Tesouraria.</Bullet>
      </Page>

      {/* Achados */}
      <Page size="A4" style={styles.page}>
        <RunningHeader label="Achados para auditoria" />
        <Footer />
        <H1 bookmark="13. Achados para auditoria (16 pontos de atenção)">13. Achados para auditoria (16 pontos de atenção)</H1>
        <P>
          Consolidação do que este levantamento encontrou como inconsistência, lacuna ou regra não aplicada. Cada
          achado traz agora a situação depois da rodada de correções de 19/08/2026. Ver legenda de severidade na
          página 2.
        </P>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>O que foi corrigido além desta lista</Text>
          <Text style={styles.cardLine}>
            A maior parte do trabalho de correção não saiu destes 16 pontos: veio da revisão de segurança, que
            corria em paralelo e não estava neste documento. Registrado aqui para o número de achados resolvidos
            abaixo não dar a impressão errada de que pouco mudou.
          </Text>
          <Text style={[styles.cardLine, styles.cardLabel, { marginTop: 4 }]}>Segurança</Text>
          <Text style={styles.cardLine}>
            A decisão de aprovação passou a exigir que quem chama seja o aprovador designado: antes, omitir um campo
            do corpo pulava toda a checagem e permitia aprovar qualquer valor sem papel e sem rastro. As rotas de API
            passaram a ficar sob o middleware, que não as cobria: 30 de 57 não tinham checagem própria. A flag de
            bypass de autenticação passou a ser ignorada em produção e documentada. O webhook do Slack deixou de
            aceitar evento quando o segredo falta. A importação de contratos passou a exigir sessão de administrador.
            Desativar uma pessoa passou a encerrar a sessão dela.
          </Text>
          <Text style={[styles.cardLine, styles.cardLabel, { marginTop: 4 }]}>Integridade de dados</Text>
          <Text style={styles.cardLine}>
            O código sequencial das solicitações era gerado contando linhas, o que colidia sob concorrência: medido,
            20 criações simultâneas produziam 20 códigos e 1 valor distinto. As 15 rotas de etapa passaram a gravar
            a mudança e o registro de auditoria na mesma transação. O CNPJ passou a ser normalizado, o que fazia o
            controle anti-fracionamento somar zero e nunca sinalizar. A importação de contratos deixou de duplicar a
            carteira. Foram criados 45 índices, onde não havia nenhum.
          </Text>
          <Text style={[styles.cardLine, styles.cardLabel, { marginTop: 4 }]}>Operação e uso</Text>
          <Text style={styles.cardLine}>
            Passaram a existir telas de erro, log estruturado e conferência de variáveis de ambiente na
            inicialização. Os tokens de máquina deixaram de aceitar a string literal que a ausência da variável
            produzia. Uploads ganharam limite de tipo e tamanho. Os PDFs de Pedido de Compra saíram da pasta pública,
            onde eram enumeráveis. As ações de etapa e os painéis administrativos passaram a dar retorno visível, no
            sucesso e na falha.
          </Text>
        </View>

        <Finding n={1} severity="doc" situacao="resolvido" comoFoiResolvido="por decisão do time, esses tempos são referência de expectativa, não prazo cobrado. Deixaram de ser dado morto: a tela da solicitação passou a mostrar o tempo esperado da etapa atual e a previsão de conclusão, com o aviso de que não travam nada. Os tempos das etapas de execução foram definidos com o time (Mapa de Cotação, Pedido de Compra, Medição, Fiscal, Tesouraria e Mapeamento de Contrato); Solicitação, Aguardando Entrega e os estados finais seguem sem tempo de propósito. Manual corrigido." title="SLA por etapa é só cosmético">
          Os campos de prazo por etapa (Corporativo, Tecnologia e Revenue) só existem em 8 das 16 etapas e nunca são lidos em código. O único prazo de fato aplicado é o prazo geral, calculado uma vez na criação da solicitação.
        </Finding>
        <Finding n={2} severity="doc" situacao="resolvido" comoFoiResolvido="as 15 rotas de etapa passaram a usar um helper transacional que consulta o grafo antes de gravar." title="Grafo de transições válidas não é reforçado em produção">
          A função que valida se uma transição de etapa é permitida existe só para os testes automatizados. Cada rota de API faz sua própria checagem isolada da etapa atual, sem consultar esse grafo.
        </Finding>
        <Finding n={3} severity="regra" situacao="resolvido" comoFoiResolvido="a Triagem passou a disparar e-mail e mensagem de Slack para a Controladoria quando sinaliza o risco, com a alçada isolada e a somada dos últimos 12 meses. O registro de notificação que afirmava um envio inexistente saiu: quem grava agora é o próprio envio, com ENVIADO ou FALHA conforme o resultado real." title="Alerta de fracionamento não avisa ninguém de verdade">
          Quando o sistema detecta risco de fracionamento na Triagem, ele grava um registro de notificação no banco. Diferente de todo outro alerta do sistema, não dispara e-mail nem Slack de fato. A Controladoria não é realmente avisada.
        </Finding>
        <Finding n={4} severity="regra" situacao="parcial" comoFoiResolvido="por decisão do time, a triagem sinaliza mas não bloqueia: a solicitação avisa quando o fornecedor escolhido está pendente ou reprovado, e há um campo de anexo opcional para a evidência da verificação, que o comprador faz fora do sistema. O bloqueio antes do Pedido de Compra fica para depois." title="Triagem básica de fornecedor é código morto">
          Existe uma função pronta e testada para exigir triagem básica de fornecedor novo (CNPJ ativo, listas restritivas). Ela nunca é chamada por nenhuma rota real. A regra está escrita, mas não está em vigor.
        </Finding>
        <Finding n={5} severity="doc" situacao="resolvido" comoFoiResolvido="o prazo passou a ser calculado por uma função que pula sábado e domingo, então uma aprovação aberta na quinta vence na terça, não no domingo. Feriado ainda não é considerado, por falta de calendário de feriados no sistema." title="Escalonamento de 3 dias é corrido, não útil">
          O prazo de decisão do aprovador antes do lembrete automático é chamado de dias úteis no código, mas a conta real não pula fim de semana. São 3 dias corridos de fato.
        </Finding>
        <Finding n={6} severity="doc" situacao="resolvido" comoFoiResolvido="o texto do lembrete passou a ler a mesma constante que calcula o prazo, e a variável de ambiente duplicada foi removida, então mensagem e prazo não têm mais como divergir." title="Mensagem de lembrete pode divergir do prazo real">
          O texto do lembrete de escalonamento lê uma variável de ambiente diferente da que de fato define o prazo. Mudar uma não muda a outra, o que pode deixar a mensagem incoerente com o prazo real aplicado.
        </Finding>
        <Finding n={7} severity="doc" situacao="resolvido" comoFoiResolvido="os dois comentários do modelo de dados foram corrigidos, e uma terceira menção que sobrou no cálculo da alçada, encontrada só na verificação posterior, também." title="Comentários do schema ainda citam o papel de CEO">
          O papel de CEO foi removido do sistema e não existe mais no cadastro de papéis. Dois comentários no modelo de dados ainda descrevem a alçada de nível 3 como envolvendo o CEO. É desatualização de documentação interna.
        </Finding>
        <Finding n={8} severity="regra" situacao="resolvido" comoFoiResolvido="fechado em três pontos: os dois ramos da Validação Orçamentária e a Aprovação do Gestor. Esta última saiu do fluxo em 21/08/2026, e o ponto de cobrança que ela levava junto foi reposto no atalho de CANCELAMENTO da Triagem, que é a única saída que pula a Validação Orçamentária. Um agente adversarial ainda encontrou o caminho mais fácil de todos, que era o controle inteiro depender de um booleano declarado pelo próprio solicitante na criação: bastava digitar qualquer coisa no campo Linha do Orçamento para desligá-lo nos três pontos de uma vez. Hoje abrir a exceção por indisponibilidade de orçamento marca a solicitação como extra-orçamentária, corrigindo o registro, e APROVAR a exceção exige o comprovante independente do que foi marcado na abertura. Reprovar segue livre, senão a solicitação fica presa esperando um documento que pode nunca chegar. O que sobra: a criação ainda aceita Orçamento Extra sem anexo." title="Anexo obrigatório do Orçamento Extra só é exigido na tela">
          O formulário impede o envio sem o anexo de validação do FP&amp;A quando Orçamento Extra é escolhido. A API que de fato cria a solicitação aceita a mesma opção sem checar se o anexo existe. Uma chamada direta à API contornaria essa exigência.
        </Finding>
        <Finding n={9} severity="doc" situacao="resolvido" comoFoiResolvido="o caminho aprovado deixou de ser silencioso e passou a usar o mesmo aviso das outras etapas, informando ao solicitante que a compra seguiu para Homologação e Triagem." title="Aprovação do gestor não notifica o lado positivo">
          Ao contrário de toda outra etapa, quando o gestor do centro de custo aprova a solicitação, nenhum e-mail é enviado ao solicitante. Só a reprovação gera notificação.
        </Finding>
        <Finding n={10} severity="doc" situacao="resolvido" comoFoiResolvido="a cadência passou a ser decidida pela própria rota, a partir do último alerta registrado para o contrato: só sai aviso novo se o anterior tiver mais de uma semana. Sem campo novo no banco, usando o histórico que já existia. Chamada duas vezes no mesmo dia, a rota avisa uma vez só; e o agendador passa a ser configurado para rodar todo dia, de modo que um dia perdido é recuperado no dia seguinte. A janela tem meia jornada de folga, para que um atraso de minutos no agendador não pule a semana inteira. O manual passou a descrever a regra por extenso." title="Alerta de renovação de contrato não garante cadência semanal">
          O alerta de renovação disparava em toda chamada da rota, sem olhar o histórico de envios. Duas execuções no mesmo dia mandavam dois avisos iguais, e a periodicidade prometida dependia inteiramente de como o agendador externo estivesse configurado, sem configuração versionada no repositório.
        </Finding>
        <Finding n={11} severity="doc" situacao="resolvido" comoFoiResolvido="o canal gravado passou a refletir os dois meios, e a tela do contrato traduz o valor." title="Registro de alerta de contrato subestima o canal usado">
          O log de alerta de renovação sempre grava o canal como e-mail, mesmo nas execuções em que um Slack também foi enviado. O registro não reflete os dois canais reais usados.
        </Finding>
        <Finding n={12} severity="regra" situacao="resolvido" comoFoiResolvido="o formulário passou a ler o contrato de origem e abrir preenchido com fornecedor, tipo de demanda, descrição, diretoria e centro de custo. A primeira correção resolvia só metade: quem clicava no e-mail sem sessão viva era mandado ao login e voltava sem o parâmetro, caindo no mesmo formulário em branco, porque o redirecionamento descartava a query. Corrigido depois, com teste." title="Link de pré-preenchimento a partir de contrato não funciona">
          O e-mail de alerta de renovação leva a um link que promete pré-preencher uma nova solicitação a partir do contrato vencendo. Esse parâmetro não é lido em lugar nenhum do formulário. O link abre um formulário em branco.
        </Finding>
        <Finding n={13} severity="admin" situacao="resolvido" comoFoiResolvido="os seis papéis de etapa ganharam botão próprio na tela de acessos, e a rota que grava passou a aceitar os 11, na mesma tabela que a checagem de permissão consulta. Conceder Fiscal ou Tesouraria não exige mais mexer no banco." title="6 dos 11 papéis não têm tela de gestão">
          A página de Acessos só concede ou revoga 5 papéis. Os outros 6 (Tesouraria, Fiscal, Jurídico, Privacidade, Coordenação, Gerente F&amp;NC) têm poder real sobre dinheiro ou aspectos jurídicos, mas só aparecem como filtro. Não existe caminho pela interface pra tornar alguém, por exemplo, Fiscal ou Tesouraria. Só via banco de dados diretamente.
        </Finding>
        <Finding n={14} severity="seg" situacao="resolvido" comoFoiResolvido="a checagem de vínculo que faltava foi feita em 20/08: as duas rotas de anexo de chamado passaram a exigir que quem chama seja o dono do chamado ou tenha acesso ao quadro, e a identidade de quem anexa vem da sessão em vez do corpo da requisição." title="Anexo de chamado sem checagem de quem está anexando">
          Ao contrário do endpoint de mensagens, que confere se quem está agindo é o solicitante ou tem acesso ao quadro, o endpoint de anexar arquivo a um chamado aceita qualquer chamada que souber o identificador do chamado, sem checar identidade.
        </Finding>
        <Finding n={15} severity="seg" situacao="parcial" comoFoiResolvido="a mudança de etapa e o registro de auditoria passaram a ser atômicos. O recálculo simplificado de status segue como está." title="Override administrativo pode reabrir o que já foi encerrado">
          O mecanismo de exceção, mover uma solicitação pra qualquer etapa sem revalidar nada, recalcula o status de forma simplificada. Mover uma solicitação Cancelada ou Concluída de volta pra qualquer etapa intermediária a marca automaticamente como Aberta de novo, mesmo sem reverter de fato a razão original do cancelamento ou conclusão.
        </Finding>
        <Finding n={16} severity="seg" title="Chave de criptografia de IA é única e compartilhada">
          As chaves de API de IA de cada pessoa são guardadas criptografadas no banco, mas a chave que criptografa todas elas vem de uma única variável de ambiente. Não é um cofre de segredos gerenciado, nem uma chave por usuário. O próprio código já sinaliza isso como algo a revisar antes de produção.
        </Finding>

        <H2>Encontrado depois: esta auditoria olhou escrita e não olhou leitura</H2>
        <P>
          Os 16 achados acima saíram de uma leitura concentrada em quem pode ALTERAR o sistema. No dia
          seguinte, um inventário das 74 rotas mostrou que o outro lado nunca tinha sido olhado: 37 delas não
          exigiam nada além de uma sessão qualquer, e 16 eram de risco alto. Entre elas, o download de
          qualquer anexo, a carteira inteira de contratos e a exportação completa da base em Excel.
        </P>
        <P>
          Junto veio um vazamento que ninguém decidiu: 24 rotas devolviam as chaves de IA pessoais no corpo
          da resposta. A causa era sempre a mesma, um include escrito para pegar o nome de quem pediu e o
          banco entregando todas as colunas junto. Um único ponto, o helper de avanço de etapa, respondia por
          14 delas.
        </P>
        <P>
          A alçada, que é o controle financeiro central, tinha dois furos que não eram de autenticação e por
          isso escaparam desta auditoria inteira: o nível saía do valor estimado na Triagem e nunca era
          reconferido contra a cotação vencedora, e a tabela de aprovadores estava vazia nos três níveis, o
          que fazia do caminho manual o único existente. Na prática, o comprador escolhia quem aprova a
          própria compra.
        </P>
        <P>
          A lição de método vale mais que os itens. Quase tudo isso foi encontrado por um agente adversarial
          atacando trabalho recém-concluído, não pela leitura que o produziu, e vários furos estavam no
          código escrito horas antes no mesmo dia, incluindo comentários que afirmavam uma cobertura que o
          código não tinha. Existe agora uma trava automatizada que reprova rota nova sem decisão de acesso,
          para o próximo esquecimento falhar sozinho em vez de esperar a próxima auditoria.
        </P>

        <H2>Este documento descreve o código, não o ambiente</H2>
        <P>
          Um achado marcado como resolvido significa que o código mudou e que existe teste cobrindo. Não
          significa que o sistema está configurado nem que foi exercido. Em 20/08/2026 a tabela de
          aprovadores por alçada estava vazia, o caminho autenticado nunca tinha sido percorrido por uma
          pessoa (toda verificação em navegador rodou com o desvio de autenticação de desenvolvimento
          ligado, e os testes simulam a sessão), e não existia deploy nem integração contínua. Ler os selos
          acima como atestado de prontidão para produção seria erro de interpretação.
        </P>
      </Page>
    </Document>
  );
}
