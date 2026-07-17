import { Document, Page, Text, View, StyleSheet, Image, Font } from "@react-pdf/renderer";
import fs from "fs";
import path from "path";

/**
 * Manual do Processo — Compras, Viagens Acerto e Facilities.
 * Documento de orientação (não é UI de produto), por isso segue a paleta e
 * tipografia de DOCUMENTO da Acerto (skill acerto-docs), diferente da paleta
 * de produto usada em globals.css.
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
  sacola: img("sacola.png"),
  carro: img("carro.png"),
  roloPintura: img("rolo-pintura.png"),
  relogio: img("relogio-generico.png"),
  historico: img("historico-generico.png"),
  cadeado: img("cadeado-fechado.png"),
  documentoCheck: img("documento-check.png"),
  sino: img("sino.png"),
  alvo: img("alvo-verde.png"),
  trofeu: img("trofeu-verde.png"),
};

// Paleta oficial de DOCUMENTOS da Acerto (skill acerto-docs/references/cores-e-tipografia.md).
const GREEN = "#25D366";
const GREEN_DARK = "#128C3E";
const BLACK = "#000000";
const INK_SOFT = "#3B3F45";
const GRAY_BG = "#F5F6FA";
const WHITE = "#FFFFFF";
const BORDER = "#E3E5EC";

const PAGE_PADDING = 40;

const styles = StyleSheet.create({
  cover: {
    backgroundColor: GREEN,
    padding: 0,
    fontFamily: "Montserrat",
  },
  coverWordmark: { width: 150, height: 38, objectFit: "contain", marginTop: 90, marginLeft: 48 },
  coverTitle: { color: WHITE, fontSize: 30, fontWeight: 700, marginTop: 120, marginLeft: 48, marginRight: 48, lineHeight: 1.25 },
  coverSubtitle: { color: WHITE, fontSize: 13, fontWeight: 600, marginTop: 14, marginLeft: 48, opacity: 0.92 },
  coverTag: {
    color: GREEN_DARK, backgroundColor: WHITE, fontSize: 9, fontWeight: 700, alignSelf: "flex-start",
    marginLeft: 48, marginTop: 22, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 10,
  },
  coverDate: { color: WHITE, fontSize: 9, fontWeight: 400, position: "absolute", bottom: 40, left: 48, opacity: 0.85 },
  coverSorriso: { width: 260, position: "absolute", bottom: -10, right: -30, opacity: 0.9 },

  page: { padding: PAGE_PADDING, paddingTop: 74, paddingBottom: 50, fontFamily: "Montserrat", fontSize: 10.5, color: INK_SOFT },

  runningHeader: {
    position: "absolute", top: 26, left: PAGE_PADDING, right: PAGE_PADDING,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingBottom: 8, borderBottom: `0.75pt solid ${BORDER}`,
  },
  runningHeaderLogo: { width: 74, height: 19, objectFit: "contain" },
  runningHeaderText: { fontSize: 8, color: INK_SOFT, fontWeight: 600 },

  footer: {
    position: "absolute", bottom: 26, left: PAGE_PADDING, right: PAGE_PADDING,
    flexDirection: "row", justifyContent: "space-between", borderTop: `0.5pt solid ${BORDER}`, paddingTop: 6,
  },
  footerText: { fontSize: 7.5, color: "#8A8F98" },

  h1: { fontSize: 18, fontWeight: 700, color: BLACK, marginBottom: 10 },
  h1Bar: { width: 34, height: 4, backgroundColor: GREEN, borderRadius: 2, marginBottom: 8 },
  h2: { fontSize: 13, fontWeight: 600, color: GREEN_DARK, marginBottom: 8 },
  h2Row: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  h2Icon: { width: 16, height: 16, objectFit: "contain" },
  body: { fontSize: 10.5, lineHeight: 1.5, color: INK_SOFT, marginBottom: 8 },
  sectionBlock: { marginBottom: 20 },

  card: { backgroundColor: GRAY_BG, borderRadius: 8, padding: 12, marginBottom: 10 },
  cardTitle: { fontSize: 10.5, fontWeight: 700, color: BLACK, marginBottom: 4 },
  cardText: { fontSize: 10, lineHeight: 1.45, color: INK_SOFT },

  stageRow: { flexDirection: "row", gap: 10, marginBottom: 9, alignItems: "flex-start" },
  stageNum: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: GREEN, color: WHITE,
    fontSize: 8.5, fontWeight: 700, textAlign: "center", paddingTop: 4,
  },
  stageBody: { flex: 1 },
  stageLabel: { fontSize: 10, fontWeight: 700, color: BLACK },
  stageDesc: { fontSize: 9.5, lineHeight: 1.4, color: INK_SOFT, marginTop: 1 },
  stageSla: { fontSize: 8, color: GREEN_DARK, fontWeight: 600, marginTop: 2 },

  bullet: { flexDirection: "row", marginBottom: 5, gap: 6 },
  bulletDot: { color: GREEN_DARK, fontWeight: 700, fontSize: 10 },
  bulletText: { fontSize: 10, lineHeight: 1.45, color: INK_SOFT, flex: 1 },

  table: { borderRadius: 6, overflow: "hidden", border: `0.75pt solid ${BORDER}`, marginTop: 4, marginBottom: 10 },
  tr: { flexDirection: "row", borderTop: `0.5pt solid ${BORDER}` },
  trHead: { flexDirection: "row", backgroundColor: GREEN },
  th: { fontSize: 8.5, fontWeight: 700, color: WHITE, padding: 6 },
  td: { fontSize: 9, color: INK_SOFT, padding: 6 },
  tdStrong: { fontWeight: 700, color: BLACK },

  toc: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottom: `0.5pt solid ${BORDER}` },
  tocText: { fontSize: 10.5, color: INK_SOFT },
  tocNum: { fontSize: 10.5, fontWeight: 700, color: GREEN_DARK, width: 20 },
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
      <Text style={styles.footerText}>Manual do Processo de Solicitações Internas · Uso interno Acerto</Text>
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

function H2({ children, icon }: { children: string; icon?: Buffer | null }) {
  return (
    <View style={styles.h2Row}>
      {icon && <Image style={styles.h2Icon} src={{ data: icon, format: "png" }} />}
      <Text style={styles.h2}>{children}</Text>
    </View>
  );
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardText}>{children}</Text>
    </View>
  );
}

function Stage({ n, label, desc, sla }: { n: number; label: string; desc: string; sla?: string }) {
  return (
    <View style={styles.stageRow}>
      <Text style={styles.stageNum}>{n}</Text>
      <View style={styles.stageBody}>
        <Text style={styles.stageLabel}>{label}</Text>
        <Text style={styles.stageDesc}>{desc}</Text>
        {sla && <Text style={styles.stageSla}>Prazo esperado: {sla}</Text>}
      </View>
    </View>
  );
}

const TODAY = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

export function ManualProcessoDocument() {
  return (
    <Document>
      {/* Capa */}
      <Page size="A4" style={styles.cover}>
        {ASSETS.wordmarkWhite && <Image style={styles.coverWordmark} src={{ data: ASSETS.wordmarkWhite, format: "png" }} />}
        <Text style={styles.coverTag}>ORIENTAÇÃO INTERNA</Text>
        <Text style={styles.coverTitle}>Manual do Processo{"\n"}de Solicitações Internas</Text>
        <Text style={styles.coverSubtitle}>Solicitação de Compras · Viagens Acerto · Facilities</Text>
        <Text style={styles.coverDate}>Atualizado em {TODAY}</Text>
        {ASSETS.sorrisoBranco && <Image style={styles.coverSorriso} src={{ data: ASSETS.sorrisoBranco, format: "png" }} />}
      </Page>

      {/* Conteúdo — um único Page que se estende automaticamente por quantas páginas forem necessárias */}
      <Page size="A4" style={styles.page}>
        <RunningHeader label="Manual do Processo de Solicitações Internas" />
        <Footer />

        {/* Sumário */}
        <View style={styles.sectionBlock} bookmark={{ title: "Sumário" }}>
          <View style={styles.h1Bar} />
          <Text style={styles.h1}>Sumário</Text>
          {[
            "1. Introdução",
            "2. Solicitação de Compras — visão geral do fluxo",
            "3. Como abrir uma solicitação de compra",
            "4. Regras e controles importantes",
            "5. Pedido de Compra, Contratos e Dashboards",
            "6. Quem pode acessar o quê",
            "7. Viagens Acerto",
            "8. Facilities",
            "9. Dúvidas e contato",
          ].map((line) => (
            <View key={line} style={styles.toc}>
              <Text style={styles.tocText}>{line}</Text>
            </View>
          ))}
        </View>

        {/* 1. Introdução */}
        <H1 bookmark="1. Introdução">1. Introdução</H1>
        <P>
          Este manual explica, de ponta a ponta, como funcionam as três formas de abrir uma solicitação
          para as áreas internas da Acerto: Solicitação de Compras, Viagens Acerto e Facilities. A ideia é
          que qualquer pessoa da empresa consiga entender o caminho que a própria solicitação percorre —
          da abertura até a conclusão — sem precisar perguntar para ninguém.
        </P>
        <P>
          Ao acessar o sistema, você encontra um cardápio com três opções. Cada uma delas tem seu próprio
          fluxo, detalhado nas seções a seguir.
        </P>
        <Card title="Solicitação de Compras">
          Para comprar produtos, contratar serviços, homologar ferramentas novas, renovar ou cancelar
          contratos. É o fluxo mais completo, com etapas de triagem, orçamento, cotação, aprovação e
          pagamento.
        </Card>
        <Card title="Viagens Acerto">
          Para pedidos relacionados a viagens a trabalho. Um fluxo simples: você descreve o que precisa e
          acompanha o retorno do time responsável dentro do próprio chamado.
        </Card>
        <Card title="Facilities">
          Para pedidos de infraestrutura e manutenção do dia a dia do escritório. Mesmo formato simples de
          chamado do Viagens Acerto.
        </Card>

        {/* 2. Compras — visão geral */}
        <H1 bookmark="2. Solicitação de Compras — visão geral">2. Solicitação de Compras — visão geral do fluxo</H1>
        <P>
          Toda solicitação de compra passa por uma sequência de etapas. Nem toda solicitação passa por
          todas elas — algumas são puladas automaticamente dependendo do tipo de demanda e do valor
          envolvido (veja a seção 4). Abaixo está a sequência completa, na ordem em que ela normalmente
          acontece:
        </P>
        <Stage n={1} label="Solicitação de Compra" desc="Quem precisa comprar algo abre a solicitação com os dados básicos: o que é, para qual centro de custo, valor estimado e prioridade." />
        <Stage n={2} label="Homologação e Triagem" desc="O time de Compras | F&NC confere se as informações estão completas antes de seguir." sla="1 dia útil (Corporativo) · 2 dias úteis (Tecnologia e Revenue)" />
        <Stage n={3} label="Validação Orçamentária" desc="Verificamos se existe orçamento disponível na linha informada. Se não houver, a solicitação entra em um fluxo de exceção orçamentária até uma decisão." sla="1 dia útil (Corporativo) · 2 dias úteis (Tecnologia e Revenue)" />
        <Stage n={4} label="Due Diligence (Privacidade)" desc="Só acontece para contratação de ferramenta nova ou que lide com dados pessoais: avaliação de privacidade e segurança antes de cotar." sla="2 dias úteis" />
        <Stage n={5} label="Cotação" desc="O time de Compras busca propostas com fornecedores. O número mínimo de cotações depende do valor da compra (veja seção 4)." sla="5 dias úteis (Corporativo) · 7 dias úteis (Tecnologia e Revenue)" />
        <Stage n={6} label="Mapa de Cotação" desc="As propostas recebidas são organizadas lado a lado para comparação e escolha do fornecedor." />
        <Stage n={7} label="Aprovação" desc="A solicitação segue para quem tem alçada de aprovar aquele valor (veja a tabela de alçadas na seção 4)." sla="1 dia útil (Corporativo) · 2 dias úteis (Tecnologia e Revenue)" />
        <Stage n={8} label="Jurídico" desc="Quando a compra exige contrato formal, o Jurídico revisa e valida as cláusulas antes de seguir." sla="20 dias úteis (Corporativo) · 30 dias úteis (Tecnologia e Revenue)" />
        <Stage n={9} label="Pedido de Compra" desc="Emitimos o Pedido de Compra oficial em PDF, com dados do fornecedor, itens, valores e condições de pagamento." />
        <Stage n={10} label="Aguardando Entrega/Conclusão" desc="Aguardamos a entrega do produto ou a execução do serviço contratado." />
        <Stage n={11} label="Medição e Aprovação Financeira" desc="Para compras que exigem medição (ex.: serviços recorrentes, obras), validamos o quanto foi efetivamente entregue antes do pagamento." />
        <Stage n={12} label="Validação Fiscal" desc="Conferência fiscal da nota/documento antes de liberar o pagamento." />
        <Stage n={13} label="Tesouraria (Pagamento)" desc="Efetivação do pagamento ao fornecedor." />
        <Stage n={14} label="Mapeamento de Contrato" desc="Quando a compra gera um contrato vigente, ele é cadastrado na gestão de contratos, com alertas automáticos de renovação." />
        <Stage n={15} label="Concluído" desc="A solicitação é encerrada." />
        <Card title="Cancelamento">
          A solicitação pode ser cancelada em praticamente qualquer etapa do fluxo — por exemplo, se o
          orçamento for reprovado ou a aprovação for negada.
        </Card>

        {/* 3. Como abrir */}
        <H1 bookmark="3. Como abrir uma solicitação de compra">3. Como abrir uma solicitação de compra</H1>
        <P>
          Qualquer pessoa com e-mail @acerto.com.br pode abrir uma nova solicitação de compra, pelo botão
          <Text style={{ fontWeight: 700, color: BLACK }}> + Nova Solicitação</Text>. O formulário pede:
        </P>
        <Bullet><Text style={{ fontWeight: 700 }}>Solicitante</Text> — quem está pedindo a compra.</Bullet>
        <Bullet><Text style={{ fontWeight: 700 }}>Centro de custo</Text> e <Text style={{ fontWeight: 700 }}>diretoria</Text> — Corporativo, Revenue ou Tecnologia (define os prazos de SLA de cada etapa).</Bullet>
        <Bullet><Text style={{ fontWeight: 700 }}>Tipo de demanda</Text> — Compra de Produtos, Compra de Serviço, Compra de Nova Ferramenta, inclusão/remoção de usuários em ferramenta já existente, upgrade ou downgrade de versão, renovação de contrato existente, ou cancelamento de contrato/serviço/ferramenta.</Bullet>
        <Bullet><Text style={{ fontWeight: 700 }}>Descrição curta e detalhada</Text> do que está sendo solicitado.</Bullet>
        <Bullet><Text style={{ fontWeight: 700 }}>Prioridade</Text> — Baixa, Média, Alta ou Crítica (urgência máxima). Prioridade Crítica reduz o prazo total do fluxo pela metade.</Bullet>
        <Bullet><Text style={{ fontWeight: 700 }}>Prazo sugerido</Text>, <Text style={{ fontWeight: 700 }}>linha orçamentária</Text>, e se a compra já teve <Text style={{ fontWeight: 700 }}>pré-aprovação da liderança</Text> (e, se sim, de qual gestor).</Bullet>
        <Bullet>Anexos de apoio (proposta, briefing, etc.), quando fizer sentido.</Bullet>
        <P>
          Depois de aberta, a solicitação aparece no quadro de Solicitações, organizado por etapa, e pode
          ser acompanhada por qualquer pessoa com acesso ao quadro (veja a seção 6).
        </P>

        {/* 4. Regras */}
        <H1 bookmark="4. Regras e controles importantes">4. Regras e controles importantes</H1>
        <P>
          Algumas regras existem para proteger a empresa de risco e fraude, e valem para toda solicitação
          de compra, independentemente do valor ou tipo:
        </P>
        <H2 icon={ASSETS.alvo}>Faixas de risco (lanes)</H2>
        <P>Nem toda compra passa pelo fluxo completo. O sistema classifica automaticamente cada solicitação em uma faixa:</P>
        <View style={styles.table}>
          <View style={styles.trHead}>
            <Text style={[styles.th, { width: 90 }]}>Faixa</Text>
            <Text style={[styles.th, { flex: 1 }]}>Quando se aplica</Text>
          </View>
          <View style={styles.tr}>
            <Text style={[styles.td, styles.tdStrong, { width: 90 }]}>Fast</Text>
            <Text style={[styles.td, { flex: 1 }]}>Valor até R$ 5 mil, fornecedor já homologado e de baixo risco. Cotação única.</Text>
          </View>
          <View style={styles.tr}>
            <Text style={[styles.td, styles.tdStrong, { width: 90 }]}>Standard</Text>
            <Text style={[styles.td, { flex: 1 }]}>A maioria das compras — segue o fluxo completo normalmente.</Text>
          </View>
          <View style={styles.tr}>
            <Text style={[styles.td, styles.tdStrong, { width: 90 }]}>Strategic</Text>
            <Text style={[styles.td, { flex: 1 }]}>Valor acima de R$ 500 mil, fornecedor de alto risco, ou ferramenta nova/que lida com dados pessoais acima de R$ 500 mil. Sempre passa pelo fluxo completo.</Text>
          </View>
        </View>

        <H2 icon={ASSETS.documentoCheck}>Alçadas de aprovação</H2>
        <View style={styles.table}>
          <View style={styles.trHead}>
            <Text style={[styles.th, { width: 60 }]}>Nível</Text>
            <Text style={[styles.th, { width: 110 }]}>Valor da compra</Text>
            <Text style={[styles.th, { flex: 1 }]}>Quem aprova</Text>
          </View>
          <View style={styles.tr}>
            <Text style={[styles.td, styles.tdStrong, { width: 60 }]}>1</Text>
            <Text style={[styles.td, { width: 110 }]}>Até R$ 50 mil</Text>
            <Text style={[styles.td, { flex: 1 }]}>Coordenação F&NC com procuração, ou Gerente F&NC</Text>
          </View>
          <View style={styles.tr}>
            <Text style={[styles.td, styles.tdStrong, { width: 60 }]}>2</Text>
            <Text style={[styles.td, { width: 110 }]}>Até R$ 500 mil</Text>
            <Text style={[styles.td, { flex: 1 }]}>Gerente F&NC</Text>
          </View>
          <View style={styles.tr}>
            <Text style={[styles.td, styles.tdStrong, { width: 60 }]}>3</Text>
            <Text style={[styles.td, { width: 110 }]}>Acima de R$ 500 mil</Text>
            <Text style={[styles.td, { flex: 1 }]}>Gerente F&NC + CEO</Text>
          </View>
        </View>

        <H2 icon={ASSETS.cadeado}>Segregação de função</H2>
        <P>Quem abre a solicitação nunca pode ser o comprador responsável, nem o aprovador da própria solicitação.</P>

        <H2 icon={ASSETS.historico}>Anti-fracionamento</H2>
        <P>
          O sistema soma o valor de todas as solicitações do mesmo fornecedor nos últimos 12 meses. Se a
          soma ultrapassar uma alçada que o valor individual não atingiria sozinho, a Controladoria é
          avisada para revisar antes de prosseguir — isso evita que uma compra grande seja dividida em
          várias pequenas para escapar da aprovação de nível superior.
        </P>

        <H2 icon={ASSETS.documentoCheck}>Número mínimo de cotações</H2>
        <P>Compras até R$ 2.500 podem seguir com cotação única. Acima disso, são necessárias no mínimo 3 propostas de fornecedores diferentes.</P>

        <H2 icon={ASSETS.cadeado}>Personificação controlada de aprovador</H2>
        <P>
          Em caso de urgência ou ausência do aprovador, o comprador pode personificá-lo — mas só até o
          Nível 1 de alçada (R$ 50 mil). A ação sempre notifica o aprovador real, para manter transparência.
        </P>

        <H2 icon={ASSETS.documentoCheck}>Conflito de interesse</H2>
        <P>Antes da aprovação final, é preciso declarar se há algum conflito de interesse pessoal com o fornecedor escolhido.</P>

        <H2 icon={ASSETS.relogio}>Prazos e escalonamento</H2>
        <P>
          Cada etapa tem um prazo esperado (mostrado na seção 2). Se um aprovador não decidir dentro de 3
          dias úteis, o sistema notifica automaticamente o próximo nível hierárquico e a Controladoria —
          para que a solicitação nunca fique parada sem ninguém saber.
        </P>

        {/* 5. PC, Contratos, Dashboards */}
        <H1 bookmark="5. Pedido de Compra, Contratos e Dashboards">5. Pedido de Compra, Contratos e Dashboards</H1>
        <H2 icon={ASSETS.documentoCheck}>Pedido de Compra</H2>
        <P>
          Quando a solicitação chega na etapa de Pedido de Compra, o sistema gera automaticamente um PDF
          oficial com a identidade da Acerto, contendo os dados da empresa e do fornecedor, a lista de
          itens, valores, impostos, condição de pagamento e prazo de entrega. Esse PDF fica disponível para
          download a qualquer momento na própria solicitação.
        </P>
        <H2 icon={ASSETS.historico}>Contratos</H2>
        <P>
          Compras que envolvem contrato (aluguel, prestação de serviço recorrente, licenciamento de
          ferramenta, etc.) são registradas na área de Contratos, com data de vigência e alertas automáticos
          quando a renovação estiver se aproximando — para que ninguém seja pego de surpresa por um
          contrato vencendo.
        </P>
        <H2 icon={ASSETS.alvo}>Dashboards</H2>
        <P>
          A área de Dashboards mostra uma visão consolidada de todas as solicitações: quantas estão em
          cada etapa, tempo médio de ciclo, valores por diretoria e alertas de solicitações fora do prazo —
          útil para o time de Compras | F&NC acompanhar a saúde geral do processo.
        </P>

        {/* 6. Acesso */}
        <H1 bookmark="6. Quem pode acessar o quê">6. Quem pode acessar o quê</H1>
        <Card title="Nova Solicitação — aberto para todo mundo">
          Qualquer pessoa com e-mail corporativo @acerto.com.br pode abrir uma nova solicitação de compra
          a qualquer momento.
        </Card>
        <Card title="Solicitações, Contratos e Dashboards — acesso restrito">
          Essas três áreas só ficam visíveis para uma lista específica de pessoas autorizadas, mantida por
          um administrador do sistema. Se você tentar acessar sem estar na lista, verá uma tela informando
          que não tem permissão — nesse caso, procure o administrador do sistema para solicitar acesso.
        </Card>

        {/* 7. Viagens Acerto */}
        <H1 bookmark="7. Viagens Acerto">7. Viagens Acerto</H1>
        <P>Um fluxo simples e direto, pensado para pedidos relacionados a viagens a trabalho.</P>
        <Stage n={1} label="Abrir chamado" desc="Informe seu nome, e-mail e descreva com detalhes o que você precisa (datas, destino, motivo da viagem, etc.)." />
        <Stage n={2} label="Acompanhamento" desc="O chamado aparece no quadro em uma das três colunas: Aberto, Em Andamento ou Concluído." />
        <Stage n={3} label="Troca de mensagens" desc="Toda a conversa entre você e o time responsável acontece dentro do próprio chamado, criando um histórico completo — sem depender de e-mail ou chat paralelo." />
        <Stage n={4} label="Conclusão" desc="Quando o pedido é resolvido, o time responsável marca o chamado como Concluído." />

        {/* 8. Facilities */}
        <H1 bookmark="8. Facilities">8. Facilities</H1>
        <P>Mesmo modelo simples do Viagens Acerto, para pedidos de infraestrutura e manutenção do escritório (manutenção, materiais, organização de espaços, etc.).</P>
        <Stage n={1} label="Abrir chamado" desc="Informe seu nome, e-mail e descreva o que você precisa." />
        <Stage n={2} label="Acompanhamento" desc="O chamado aparece no quadro em uma das três colunas: Aberto, Em Andamento ou Concluído." />
        <Stage n={3} label="Troca de mensagens" desc="Toda a conversa com o time de Facilities acontece dentro do próprio chamado, mantendo o histórico completo." />
        <Stage n={4} label="Conclusão" desc="Quando o pedido é resolvido, o time responsável marca o chamado como Concluído." />

        {/* 9. Dúvidas */}
        <H1 bookmark="9. Dúvidas e contato">9. Dúvidas e contato</H1>
        <P>
          Ficou com alguma dúvida sobre o processo? Fale com o time de Compras | F&NC. Para dúvidas sobre
          acesso ao sistema, procure o administrador responsável pela lista de permissões.
        </P>
      </Page>
    </Document>
  );
}
