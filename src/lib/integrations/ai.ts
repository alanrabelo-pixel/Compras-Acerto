/**
 * Assistentes de IA — pedido do usuário: dar a quem atua em cada etapa uma
 * ajuda focada (estratégia, riscos, o que confirmar/evitar) nas etapas onde
 * isso é aplicável: Triagem, Due Diligence, Cotação, Mapa de Cotação,
 * Jurídico e Mapeamento de Contrato. Cada etapa tem seu próprio prompt
 * (buildXPrompt abaixo), mas todas pedem a mesma estrutura de resposta, para
 * que um único parser/UI sirva para todas.
 *
 * Pedido do usuário: rodar Anthropic e Gemini EM PARALELO a cada geração,
 * mostrando as duas sugestões lado a lado — cada provedor falha de forma
 * independente (ver generateInsight). Ao contrário do Gmail/Slack
 * (src/lib/integrations/{gmail,slack}.ts), esta integração NÃO falha
 * silenciosamente: é uma ação sob demanda (a pessoa clica um botão e espera
 * uma resposta), não um efeito colateral em segundo plano.
 *
 * Pedido do usuário: as chamadas usam a CHAVE PESSOAL de quem está atuando
 * na etapa (User.anthropicApiKey/geminiApiKey — ver /api/users/[id]/ai-keys),
 * não uma chave única configurada para o app inteiro — todo mundo na Acerto
 * já tem acesso próprio a Claude e Gemini. O modelo (ANTHROPIC_MODEL/
 * GEMINI_MODEL) continua vindo do .env por ser uma escolha técnica do app,
 * não uma credencial pessoal.
 */

import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

export type AiInsightPayload = {
  summary: string;
  highlights: string[];
  cautions: string[];
  recommendation: string | null;
  nextStep: string | null;
};

export type ProviderResult = {
  payload: AiInsightPayload | null;
  model: string | null;
  error: string | null;
};

const RESPONSE_FORMAT_INSTRUCTION = `
Responda em português do Brasil, de forma prática e direta (sem jargão excessivo), com uma análise acionável para ESTE caso específico — não conselhos genéricos.

Responda APENAS com um JSON válido (sem markdown, sem texto antes ou depois), no formato exato:
{
  "summary": "resumo da análise/estratégia recomendada, 2-3 frases",
  "highlights": ["ponto 1", "ponto 2", "..."],
  "cautions": ["ponto de atenção/risco 1", "ponto de atenção/risco 2", "..."],
  "recommendation": "recomendação objetiva (faixa, classificação, decisão sugerida), ou null se não houver base suficiente",
  "nextStep": "próxima ação concreta recomendada, ou null"
}`;

// Schema JSON exigido via output_config.format (Anthropic) — garante que a
// resposta já venha como JSON válido nesse formato exato, em vez de confiar
// só na instrução em texto do prompt (RESPONSE_FORMAT_INSTRUCTION).
const AI_INSIGHT_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    highlights: { type: "array", items: { type: "string" } },
    cautions: { type: "array", items: { type: "string" } },
    recommendation: { anyOf: [{ type: "string" }, { type: "null" }] },
    nextStep: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
  required: ["summary", "highlights", "cautions", "recommendation", "nextStep"],
  additionalProperties: false,
} as const;

function parseInsightPayload(text: string): AiInsightPayload {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Resposta da IA não veio em formato reconhecível.");

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    summary: String(parsed.summary ?? ""),
    highlights: Array.isArray(parsed.highlights) ? parsed.highlights.map(String) : [],
    cautions: Array.isArray(parsed.cautions) ? parsed.cautions.map(String) : [],
    recommendation: parsed.recommendation ? String(parsed.recommendation) : null,
    nextStep: parsed.nextStep ? String(parsed.nextStep) : null,
  };
}

async function callAnthropic(prompt: string, apiKey: string | null): Promise<ProviderResult> {
  if (!apiKey) {
    return { payload: null, model: null, error: "Você ainda não configurou sua chave pessoal da Anthropic (Claude)." };
  }
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model,
      max_tokens: 2000,
      // Sonnet 5 roda com "adaptive thinking" ligado por padrão quando
      // `thinking` não é informado, e max_tokens vira o limite de
      // thinking+resposta somados — sem isso, o JSON podia vir cortado no
      // meio e falhar no parseInsightPayload. Desabilitar aqui é seguro
      // (permitido até effort "high", que é o padrão) e essa é uma extração
      // estruturada, não uma tarefa que se beneficia de raciocínio longo.
      thinking: { type: "disabled" },
      output_config: { format: { type: "json_schema", schema: AI_INSIGHT_JSON_SCHEMA } },
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("Resposta da IA veio vazia.");
    return { payload: parseInsightPayload(textBlock.text), model, error: null };
  } catch (err) {
    return { payload: null, model, error: err instanceof Error ? err.message : "Erro inesperado no Claude." };
  }
}

async function callGemini(prompt: string, apiKey: string | null): Promise<ProviderResult> {
  if (!apiKey) {
    return { payload: null, model: null, error: "Você ainda não configurou sua chave pessoal do Gemini." };
  }
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  try {
    const client = new GoogleGenerativeAI(apiKey);
    const generativeModel = client.getGenerativeModel({
      model,
      generationConfig: { responseMimeType: "application/json" },
    });
    const result = await generativeModel.generateContent(prompt);
    const text = result.response.text();
    if (!text) throw new Error("Resposta da IA veio vazia.");
    return { payload: parseInsightPayload(text), model, error: null };
  } catch (err) {
    return { payload: null, model, error: err instanceof Error ? err.message : "Erro inesperado no Gemini." };
  }
}

/**
 * Chama os dois provedores em paralelo, cada um com a chave pessoal de quem
 * está atuando (não uma chave única do app) — cada um falha/responde de
 * forma independente.
 */
export async function generateInsight(
  prompt: string,
  keys: { anthropicApiKey: string | null; geminiApiKey: string | null }
): Promise<{ anthropic: ProviderResult; gemini: ProviderResult }> {
  const [anthropic, gemini] = await Promise.all([
    callAnthropic(prompt, keys.anthropicApiKey),
    callGemini(prompt, keys.geminiApiKey),
  ]);
  return { anthropic, gemini };
}

// ----------------------------------------------------------------------------
// Prompts por etapa — cada um descreve o papel da IA e os dados disponíveis
// naquela etapa específica. Todos terminam com RESPONSE_FORMAT_INSTRUCTION.
// ----------------------------------------------------------------------------

export type TriagemContext = {
  demandType: string;
  shortDescription: string;
  longDescription: string;
  estimatedValue: number | null;
  quantity: number;
  priority: string;
  diretoria: string;
  indicatedSupplierName: string | null;
  leadershipPreApproved: boolean;
  supplierApproved?: boolean;
  supplierRiskTier?: string;
  handlesPersonalData?: boolean;
};

export function buildTriagemPrompt(ctx: TriagemContext): string {
  return `Você é um assistente de estratégia de compras (procurement) ajudando um comprador da Acerto (fintech brasileira) na etapa de Homologação e Triagem — o primeiro contato do comprador com a solicitação, onde ele decide a faixa de risco (lane) e se há informação suficiente para prosseguir.

Dados da solicitação:
- Tipo de demanda: ${ctx.demandType}
- Descrição: ${ctx.shortDescription}
- Detalhes: ${ctx.longDescription}
- Valor estimado: ${ctx.estimatedValue !== null ? `R$ ${ctx.estimatedValue.toLocaleString("pt-BR")}` : "não informado"}
- Quantidade: ${ctx.quantity}
- Prioridade: ${ctx.priority}
- Diretoria: ${ctx.diretoria}
- Fornecedor indicado: ${ctx.indicatedSupplierName ?? "nenhum"}
- Aprovado pela liderança na abertura: ${ctx.leadershipPreApproved ? "sim" : "não"}
- Fornecedor já homologado: ${ctx.supplierApproved === undefined ? "não informado" : ctx.supplierApproved ? "sim" : "não"}
- Risco do fornecedor (percepção do comprador): ${ctx.supplierRiskTier ?? "não informado"}
- Trata dado pessoal: ${ctx.handlesPersonalData === undefined ? "não informado" : ctx.handlesPersonalData ? "sim" : "não"}

Ajude o comprador a: identificar informações faltantes ou ambíguas que valeria confirmar com o solicitante antes de avançar; sinalizar riscos que a faixa de risco (fast/standard/strategic) deveria considerar; e recomendar a faixa de risco mais adequada.

No campo "highlights", liste informações a confirmar/faltantes. No campo "cautions", liste sinais de risco identificados. No campo "recommendation", sugira a faixa de risco (fast/standard/strategic) com uma frase de justificativa.
${RESPONSE_FORMAT_INSTRUCTION}`;
}

export type DueDiligenceContext = {
  demandType: string;
  shortDescription: string;
  longDescription: string;
  estimatedValue: number | null;
  indicatedSupplierName: string | null;
  affectedUsers: string | null;
};

export function buildDueDiligencePrompt(ctx: DueDiligenceContext): string {
  return `Você é um assistente de privacidade e segurança da informação ajudando o time de Privacidade da Acerto (fintech brasileira) na etapa de Due Diligence — avaliação obrigatória para contratação de novas ferramentas que podem tratar dados pessoais.

Dados da solicitação:
- Tipo de demanda: ${ctx.demandType}
- Descrição: ${ctx.shortDescription}
- Detalhes: ${ctx.longDescription}
- Valor estimado: ${ctx.estimatedValue !== null ? `R$ ${ctx.estimatedValue.toLocaleString("pt-BR")}` : "não informado"}
- Fornecedor indicado: ${ctx.indicatedSupplierName ?? "nenhum"}
- Usuários afetados: ${ctx.affectedUsers ?? "não informado"}

Com base apenas na descrição (você não tem acesso ao contrato ou à política de privacidade real do fornecedor), ajude a equipe a: identificar riscos de privacidade/LGPD e de segurança da informação plausíveis para este tipo de ferramenta; listar o que normalmente deveria ser verificado com o fornecedor (ex: DPA, certificações, local de armazenamento dos dados, retenção); e recomendar se aprovar, reprovar ou pedir mais informação antes de decidir.

No campo "highlights", liste os riscos de privacidade/segurança identificados. No campo "cautions", liste o que verificar com o fornecedor antes de aprovar. No campo "recommendation", indique "aprovar", "reprovar" ou "pedir mais informação" com uma frase de justificativa. Deixe claro que esta é uma triagem preliminar, não substitui a análise formal do time de Privacidade.
${RESPONSE_FORMAT_INSTRUCTION}`;
}

export type NegotiationContext = {
  stage: "COTACAO" | "MAPA_COTACAO";
  demandType: string;
  shortDescription: string;
  longDescription: string;
  estimatedValue: number | null;
  quantity: number;
  priority: string;
  diretoria: string;
  lane: string | null;
  indicatedSupplierName: string | null;
  quotes: Array<{
    supplierName: string;
    initialValue: number;
    negotiatedValue: number;
    paymentCondition: string;
  }>;
};

export function buildNegotiationPrompt(ctx: NegotiationContext): string {
  const quotesBlock =
    ctx.quotes.length > 0
      ? ctx.quotes
          .map(
            (q, i) =>
              `${i + 1}. ${q.supplierName} — valor inicial R$ ${q.initialValue.toLocaleString("pt-BR")}, ` +
              `valor negociado R$ ${q.negotiatedValue.toLocaleString("pt-BR")}, condição: ${q.paymentCondition}`
          )
          .join("\n")
      : "Nenhuma cotação registrada ainda.";

  // Com 3+ cotações (o mínimo já exigido pelo sistema para valores acima de
  // R$2.500 — ver minimumQuotesRequired), há dado suficiente para uma síntese
  // comparativa de verdade (preço x condição x risco), não só conselho de
  // negociação — o cálculo de saving em si já é feito no código; a IA só
  // organiza a comparação em texto, nunca substitui os números exibidos.
  const isComparison = ctx.stage === "MAPA_COTACAO" && ctx.quotes.length >= 3;

  const stageInstruction = isComparison
    ? "O comprador está na etapa de Mapa de Cotação com 3 ou mais cotações registradas — dado suficiente para uma comparação direta entre elas, não só conselho de negociação. Compare as cotações entre si (preço negociado, condição de pagamento, saving obtido) e aponte qual parece mais vantajosa e por quê, considerando também que a cotação com menor preço nem sempre é a melhor condição comercial geral."
    : ctx.stage === "COTACAO"
      ? "O comprador está na etapa de Cotação, prestes a negociar com um ou mais fornecedores. Foque em como abrir e conduzir a negociação."
      : "O comprador está na etapa de Mapa de Cotação, comparando as cotações já recebidas antes de escolher o vencedor. Foque em como usar as cotações concorrentes como alavanca para uma rodada final de negociação, e o que considerar na escolha.";

  return `Você é um assistente especializado em estratégia de compras (procurement) e negociação com fornecedores, ajudando um comprador da Acerto (fintech brasileira) em uma negociação real.

${stageInstruction}

Dados da solicitação de compra:
- Tipo de demanda: ${ctx.demandType}
- Descrição: ${ctx.shortDescription}
- Detalhes: ${ctx.longDescription}
- Valor estimado: ${ctx.estimatedValue !== null ? `R$ ${ctx.estimatedValue.toLocaleString("pt-BR")}` : "não informado"}
- Quantidade: ${ctx.quantity}
- Prioridade: ${ctx.priority}
- Diretoria: ${ctx.diretoria}
- Faixa de risco (lane): ${ctx.lane ?? "não definida"}
- Fornecedor indicado pelo solicitante: ${ctx.indicatedSupplierName ?? "nenhum"}

Cotações registradas até agora:
${quotesBlock}

${
  isComparison
    ? `No campo "highlights", liste os pontos fortes da cotação que parece mais vantajosa. No campo "cautions", liste riscos ou pontos de atenção de qualquer uma das cotações (ex: condição de pagamento pior apesar do preço menor). No campo "recommendation", diga qual fornecedor parece a melhor escolha geral e por quê — nunca decida por conta própria, é o comprador quem seleciona a vencedora no Mapa de Cotação.`
    : `No campo "highlights", liste os pontos a abordar na negociação. No campo "cautions", liste o que evitar. No campo "recommendation", sugira uma faixa de desconto/condição-alvo (ou null se não houver base suficiente).`
}
${RESPONSE_FORMAT_INSTRUCTION}`;
}

export type LegalReviewContext = {
  demandType: string;
  shortDescription: string;
  longDescription: string;
  estimatedValue: number | null;
  needsContract: boolean | null;
  minutaUrl: string | null;
  observations: string | null;
};

export function buildLegalReviewPrompt(ctx: LegalReviewContext): string {
  return `Você é um assistente jurídico ajudando o time Jurídico da Acerto (fintech brasileira) na etapa de revisão contratual, antes da assinatura da minuta/distrato.

Dados da solicitação:
- Tipo de demanda: ${ctx.demandType}
- Descrição: ${ctx.shortDescription}
- Detalhes: ${ctx.longDescription}
- Valor estimado: ${ctx.estimatedValue !== null ? `R$ ${ctx.estimatedValue.toLocaleString("pt-BR")}` : "não informado"}
- Precisa de contrato formal: ${ctx.needsContract === null ? "não informado" : ctx.needsContract ? "sim" : "não"}
- URL da minuta em elaboração: ${ctx.minutaUrl || "ainda não informada"}
- Observações registradas até agora pelo Jurídico: ${ctx.observations || "nenhuma"}

Você NÃO tem acesso ao texto real do contrato — trabalhe a partir do contexto acima como um checklist preliminar, não uma análise de cláusula por cláusula. Ajude o time Jurídico a: listar os tipos de cláusula de risco que costumam aparecer em contratos deste tipo de demanda/valor (ex: multa rescisória, renovação automática, exclusividade, reajuste, SLA, proteção de dados/LGPD); sugerir cláusulas que vale garantir que estejam presentes; e recomendar se está pronto para assinatura ou se precisa de ajuste.

No campo "highlights", liste as cláusulas de risco a verificar no texto real da minuta. No campo "cautions", liste cláusulas que deveriam estar presentes e podem estar faltando. No campo "recommendation", indique "pronto para assinatura", "precisa de ajuste" ou "revisar com mais atenção". Deixe claro que isso é um apoio preliminar, não substitui a leitura integral do contrato pelo Jurídico.
${RESPONSE_FORMAT_INSTRUCTION}`;
}

export type ApprovalSummaryContext = {
  demandType: string;
  category: string | null;
  shortDescription: string;
  longDescription: string;
  estimatedValue: number | null;
  diretoria: string;
  costCenterName: string;
  requesterName: string;
  lane: string | null;
  needsContract: boolean | null;
  winningQuote: { supplierName: string; initialValue: number; negotiatedValue: number; paymentCondition: string } | null;
  fragmentationFlag: boolean;
  hasConflictDeclared: boolean;
  isPersonified: boolean;
  approvalLevel: number;
};

export function buildApprovalSummaryPrompt(ctx: ApprovalSummaryContext): string {
  const saving =
    ctx.winningQuote && ctx.winningQuote.initialValue > 0
      ? ((ctx.winningQuote.initialValue - ctx.winningQuote.negotiatedValue) / ctx.winningQuote.initialValue) * 100
      : null;

  const flags: string[] = [];
  if (ctx.fragmentationFlag) flags.push("Sinalizada por risco de fracionamento (soma de compras do fornecedor nos últimos 12 meses ultrapassa a alçada individual).");
  if (ctx.hasConflictDeclared) flags.push("Há declaração de conflito de interesse registrada para esta solicitação.");
  if (ctx.isPersonified) flags.push("Esta aprovação está sendo (ou foi) personificada por um comprador em nome do aprovador real.");

  return `Você é um assistente que prepara um resumo executivo (parecer) para quem vai APROVAR OU REPROVAR uma compra na Acerto (fintech brasileira) — nunca decide por conta própria, só organiza o que já existe no registro para facilitar a leitura de quem decide.

Dados da solicitação:
- Tipo de demanda: ${ctx.demandType}
- Categoria de gasto: ${ctx.category ?? "não informada"}
- Descrição: ${ctx.shortDescription}
- Detalhes: ${ctx.longDescription}
- Valor estimado: ${ctx.estimatedValue !== null ? `R$ ${ctx.estimatedValue.toLocaleString("pt-BR")}` : "não informado"}
- Diretoria: ${ctx.diretoria}
- Centro de custo: ${ctx.costCenterName}
- Solicitante: ${ctx.requesterName}
- Faixa de risco (lane): ${ctx.lane ?? "não definida"}
- Precisa de contrato formal: ${ctx.needsContract === null ? "não informado" : ctx.needsContract ? "sim" : "não"}
- Nível de alçada de aprovação calculado: ${ctx.approvalLevel}

Cotação vencedora (Mapa de Cotação):
${
  ctx.winningQuote
    ? `${ctx.winningQuote.supplierName} — valor inicial R$ ${ctx.winningQuote.initialValue.toLocaleString("pt-BR")}, valor negociado R$ ${ctx.winningQuote.negotiatedValue.toLocaleString("pt-BR")}, condição: ${ctx.winningQuote.paymentCondition}${saving !== null ? `, saving ${saving.toFixed(1)}%` : ""}`
    : "Nenhuma cotação vencedora registrada ainda."
}

Sinalizações automáticas do sistema para esta solicitação:
${flags.length > 0 ? flags.map((f) => `- ${f}`).join("\n") : "- Nenhuma sinalização automática de risco para esta solicitação."}

Monte um parecer que ajude o aprovador a decidir rapidamente sem perder nenhum ponto relevante. No campo "summary", resuma em 2-3 frases o que está sendo comprado, por quê, e o resultado da negociação (saving, se houver). No campo "highlights", liste os pontos favoráveis à aprovação (saving obtido, fornecedor adequado, processo completo). No campo "cautions", liste TODAS as sinalizações automáticas acima (se houver) mais qualquer inconsistência que você perceba nos dados (ex: valor alto sem cotação registrada, falta de saving). No campo "recommendation", indique "aprovar", "revisar antes de aprovar" ou "reprovar" com uma frase de justificativa — deixe claro que é um parecer de apoio, a decisão final é sempre de quem tem a alçada.
${RESPONSE_FORMAT_INSTRUCTION}`;
}

export type ContractReviewContext = {
  supplierName: string;
  contractObject: string | null;
  prazo: string | null;
  paymentCondition: string | null;
  terminationClause: string | null;
  nonCompete: boolean;
  lgpdClause: boolean;
  brandUse: boolean;
  corporateChangeClause: boolean;
  estimatedValue: number | null;
};

export function buildContractReviewPrompt(ctx: ContractReviewContext): string {
  return `Você é um assistente de gestão de contratos ajudando um comprador da Acerto (fintech brasileira) na etapa de Mapeamento de Contrato — o cadastro formal do contrato no sistema, última checagem antes de concluir o processo.

Dados do contrato sendo cadastrado:
- Fornecedor: ${ctx.supplierName || "não informado"}
- Objeto do contrato: ${ctx.contractObject || "não informado"}
- Prazo: ${ctx.prazo || "não informado"}
- Condição de pagamento: ${ctx.paymentCondition || "não informado"}
- Cláusula de rescisão/renovação: ${ctx.terminationClause || "não informada"}
- Cláusula de não-concorrência marcada: ${ctx.nonCompete ? "sim" : "não"}
- Cláusula LGPD marcada: ${ctx.lgpdClause ? "sim" : "não"}
- Cláusula de uso de marca marcada: ${ctx.brandUse ? "sim" : "não"}
- Cláusula de mudança societária marcada: ${ctx.corporateChangeClause ? "sim" : "não"}
- Valor estimado: ${ctx.estimatedValue !== null ? `R$ ${ctx.estimatedValue.toLocaleString("pt-BR")}` : "não informado"}

Ajude o comprador a revisar os DADOS ACIMA (não o texto integral do contrato) e identificar: campos que parecem incompletos, vagos ou inconsistentes (ex: prazo sem unidade clara, ausência de cláusula de rescisão); cláusulas de proteção que normalmente deveriam estar marcadas para este tipo/valor de contrato e não estão; e uma recomendação sobre se o cadastro está pronto para ser concluído.

No campo "highlights", liste os pontos incompletos/vagos identificados nos dados. No campo "cautions", liste cláusulas de proteção ausentes que valeria considerar. No campo "recommendation", indique "pronto para concluir" ou "revisar antes de concluir".
${RESPONSE_FORMAT_INSTRUCTION}`;
}

// ----------------------------------------------------------------------------
// Assistente de preenchimento da Nova Solicitação — diferente do
// AiInsightPanel acima (que analisa uma PurchaseRequest já criada, em uma
// etapa específica, com histórico persistido em AiInsight), este roda ANTES
// de a solicitação existir: a pessoa descreve a necessidade em texto livre e
// recebe sugestões de preenchimento (nunca preenchimento automático — quem
// abre a solicitação sempre confirma/edita antes de enviar). Por ser uma
// sugestão rápida, sem necessidade de comparar dois provedores lado a lado,
// usa só UM provedor (Anthropic, com Gemini como alternativa se só a chave
// dele estiver configurada) em vez do padrão dual do restante do arquivo.
// ----------------------------------------------------------------------------

export type RequisitionAssistPayload = {
  demandType: string | null;
  category: string | null;
  priority: string | null;
  likelyDueDiligence: boolean;
  missingInfo: string[];
  note: string;
};

const REQUISITION_ASSIST_JSON_SCHEMA = {
  type: "object",
  properties: {
    demandType: {
      anyOf: [
        { type: "string", enum: ["COMPRA_PRODUTO", "COMPRA_SERVICO", "FERRAMENTA_NOVA", "FERRAMENTA_USUARIOS", "FERRAMENTA_UPGRADE_DOWNGRADE", "RENOVACAO_CONTRATO", "CANCELAMENTO"] },
        { type: "null" },
      ],
    },
    category: {
      anyOf: [
        { type: "string", enum: ["TI", "MARKETING", "RH", "FACILITIES", "LOGISTICA", "INDUSTRIAL", "SERVICOS_GERAIS", "OUTROS"] },
        { type: "null" },
      ],
    },
    priority: { anyOf: [{ type: "string", enum: ["BAIXA", "MEDIA", "ALTA", "CRITICA"] }, { type: "null" }] },
    likelyDueDiligence: { type: "boolean" },
    missingInfo: { type: "array", items: { type: "string" } },
    note: { type: "string" },
  },
  required: ["demandType", "category", "priority", "likelyDueDiligence", "missingInfo", "note"],
  additionalProperties: false,
} as const;

function parseRequisitionAssistPayload(text: string): RequisitionAssistPayload {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Resposta da IA não veio em formato reconhecível.");
  const parsed = JSON.parse(jsonMatch[0]);
  return {
    demandType: parsed.demandType ? String(parsed.demandType) : null,
    category: parsed.category ? String(parsed.category) : null,
    priority: parsed.priority ? String(parsed.priority) : null,
    likelyDueDiligence: Boolean(parsed.likelyDueDiligence),
    missingInfo: Array.isArray(parsed.missingInfo) ? parsed.missingInfo.map(String) : [],
    note: String(parsed.note ?? ""),
  };
}

export function buildRequisitionAssistPrompt(description: string): string {
  return `Você é um assistente que ajuda quem está abrindo uma Solicitação de Compra na Acerto (fintech brasileira) a preencher o formulário a partir de uma descrição em linguagem natural do que a pessoa precisa. Você NUNCA decide nada sozinho — só sugere valores que a pessoa vai confirmar ou corrigir antes de enviar.

Descrição da necessidade, como a pessoa escreveu:
"${description}"

Classifique nos valores EXATOS abaixo (não invente outros):
- Tipo de demanda (demandType): um de COMPRA_PRODUTO, COMPRA_SERVICO, FERRAMENTA_NOVA, FERRAMENTA_USUARIOS, FERRAMENTA_UPGRADE_DOWNGRADE, RENOVACAO_CONTRATO, CANCELAMENTO — ou null se não conseguir inferir com confiança.
- Categoria de gasto (category): um de TI, MARKETING, RH, FACILITIES, LOGISTICA, INDUSTRIAL, SERVICOS_GERAIS, OUTROS — ou null.
- Prioridade (priority): um de BAIXA, MEDIA, ALTA, CRITICA — ou null se a descrição não sugerir urgência nem rotina claramente.
- likelyDueDiligence: true se parecer uma ferramenta/serviço NOVO que provavelmente vai tratar dados pessoais (login de usuários, CRM, dados de clientes/colaboradores) — isso adianta um alerta que hoje só apareceria depois, na etapa de Triagem.
- missingInfo: lista curta do que falta ou está vago na descrição para abrir a solicitação com qualidade (ex: "não ficou claro o centro de custo", "não há indicação de fornecedor").
- note: 1-2 frases resumindo o que você entendeu, em tom direto.

Responda APENAS com um JSON válido (sem markdown, sem texto antes ou depois), no formato exato:
{
  "demandType": "...", "category": "...", "priority": "...",
  "likelyDueDiligence": true, "missingInfo": ["..."], "note": "..."
}`;
}

export async function generateRequisitionAssist(
  description: string,
  keys: { anthropicApiKey: string | null; geminiApiKey: string | null }
): Promise<{ payload: RequisitionAssistPayload | null; model: string | null; error: string | null }> {
  const prompt = buildRequisitionAssistPrompt(description);

  if (keys.anthropicApiKey) {
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
    try {
      const client = new Anthropic({ apiKey: keys.anthropicApiKey });
      const response = await client.messages.create({
        model,
        max_tokens: 800,
        thinking: { type: "disabled" },
        output_config: { format: { type: "json_schema", schema: REQUISITION_ASSIST_JSON_SCHEMA } },
        messages: [{ role: "user", content: prompt }],
      });
      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") throw new Error("Resposta da IA veio vazia.");
      return { payload: parseRequisitionAssistPayload(textBlock.text), model, error: null };
    } catch (err) {
      return { payload: null, model, error: err instanceof Error ? err.message : "Erro inesperado no Claude." };
    }
  }

  if (keys.geminiApiKey) {
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    try {
      const client = new GoogleGenerativeAI(keys.geminiApiKey);
      const generativeModel = client.getGenerativeModel({ model, generationConfig: { responseMimeType: "application/json" } });
      const result = await generativeModel.generateContent(prompt);
      const text = result.response.text();
      if (!text) throw new Error("Resposta da IA veio vazia.");
      return { payload: parseRequisitionAssistPayload(text), model, error: null };
    } catch (err) {
      return { payload: null, model, error: err instanceof Error ? err.message : "Erro inesperado no Gemini." };
    }
  }

  return { payload: null, model: null, error: "Configure sua chave pessoal da Anthropic ou do Gemini para usar o assistente." };
}
