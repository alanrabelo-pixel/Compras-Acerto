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

  const stageInstruction =
    ctx.stage === "COTACAO"
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

No campo "highlights", liste os pontos a abordar na negociação. No campo "cautions", liste o que evitar. No campo "recommendation", sugira uma faixa de desconto/condição-alvo (ou null se não houver base suficiente).
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
