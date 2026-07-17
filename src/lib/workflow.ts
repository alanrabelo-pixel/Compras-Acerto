/**
 * Acerto Compras — Máquina de estados do fluxo de compras
 *
 * Este arquivo é a "fonte da verdade" das regras de transição entre etapas.
 * Cada função guard() decide se uma transição é permitida; cada effect() descreve
 * o que deve acontecer (notificações, criação de sub-registros) ao entrar na etapa.
 *
 * IMPORTANTE: os efeitos de notificação (sendEmail/sendSlack) são chamados aqui,
 * mas a implementação de envio real está em src/lib/integrations/{gmail,slack}.ts.
 * Isso mantém a lógica de negócio separada da mecânica de integração.
 */

import { Stage, DemandType } from "@prisma/client";

export type StageDefinition = {
  stage: Stage;
  label: string;
  // Para onde essa etapa pode avançar (a decisão de qual delas é feita pelo guard)
  nextStages: Stage[];
  // SLA médio em dias (documentado no fluxo original, por diretoria)
  slaDaysCorporativo?: number;
  slaDaysTecnologiaRevenue?: number;
};

export const STAGES: Record<Stage, StageDefinition> = {
  SOLICITACAO: {
    stage: "SOLICITACAO",
    label: "Solicitação de Compra",
    nextStages: ["TRIAGEM"],
  },
  TRIAGEM: {
    stage: "TRIAGEM",
    label: "Homologação e Triagem",
    nextStages: ["VALIDACAO_ORCAMENTARIA", "CANCELADO"],
    slaDaysCorporativo: 1,
    slaDaysTecnologiaRevenue: 2,
  },
  VALIDACAO_ORCAMENTARIA: {
    stage: "VALIDACAO_ORCAMENTARIA",
    label: "Validação Orçamentária",
    // Se SIM -> Cotação (ou Due Diligence se Ferramenta Nova). Se NÃO -> workflow de exceção.
    nextStages: ["COTACAO", "DUE_DILIGENCE", "CANCELADO"],
    slaDaysCorporativo: 1,
    slaDaysTecnologiaRevenue: 2,
  },
  DUE_DILIGENCE: {
    stage: "DUE_DILIGENCE",
    label: "Due Diligence (Privacidade)",
    nextStages: ["COTACAO", "CANCELADO"],
    slaDaysCorporativo: 2,
    slaDaysTecnologiaRevenue: 2,
  },
  COTACAO: {
    stage: "COTACAO",
    label: "Cotação",
    nextStages: ["MAPA_COTACAO"],
    slaDaysCorporativo: 5,
    slaDaysTecnologiaRevenue: 7,
  },
  MAPA_COTACAO: {
    stage: "MAPA_COTACAO",
    label: "Mapa de Cotação",
    nextStages: ["APROVACAO"],
  },
  APROVACAO: {
    stage: "APROVACAO",
    label: "Aprovação",
    // Se aprovado e precisa de contrato -> Jurídico; senão -> Pedido de Compra
    nextStages: ["JURIDICO", "PEDIDO_COMPRA", "CANCELADO"],
    slaDaysCorporativo: 1,
    slaDaysTecnologiaRevenue: 2,
  },
  JURIDICO: {
    stage: "JURIDICO",
    label: "Jurídico",
    nextStages: ["PEDIDO_COMPRA"],
    slaDaysCorporativo: 20,
    slaDaysTecnologiaRevenue: 30,
  },
  PEDIDO_COMPRA: {
    stage: "PEDIDO_COMPRA",
    label: "Pedido de Compra",
    nextStages: ["AGUARDANDO_ENTREGA"],
  },
  AGUARDANDO_ENTREGA: {
    stage: "AGUARDANDO_ENTREGA",
    label: "Aguardando Entrega/Conclusão",
    // Se precisa de medição -> Medição; senão -> Mapeamento de Contrato (se aplicável) ou Concluído
    nextStages: ["MEDICAO", "MAPEAMENTO_CONTRATO", "CONCLUIDO"],
  },
  MEDICAO: {
    stage: "MEDICAO",
    label: "Medição e Aprovação Financeira",
    nextStages: ["FISCAL"],
  },
  FISCAL: {
    stage: "FISCAL",
    label: "Validação Fiscal",
    nextStages: ["TESOURARIA"],
  },
  TESOURARIA: {
    stage: "TESOURARIA",
    label: "Tesouraria (Pagamento)",
    nextStages: ["MAPEAMENTO_CONTRATO", "CONCLUIDO"],
  },
  MAPEAMENTO_CONTRATO: {
    stage: "MAPEAMENTO_CONTRATO",
    label: "Mapeamento de Contrato",
    nextStages: ["CONCLUIDO"],
  },
  CONCLUIDO: {
    stage: "CONCLUIDO",
    label: "Concluído",
    nextStages: [],
  },
  CANCELADO: {
    stage: "CANCELADO",
    label: "Cancelado",
    nextStages: [],
  },
};

/**
 * Regras de roteamento condicional — a "inteligência" que decide o próximo
 * estágio quando há mais de uma opção (equivalente às ramificações do doc original).
 *
 * Cada regra é pura (sem I/O) para facilitar testes unitários.
 */

export function nextAfterValidacaoOrcamentaria(params: {
  budgetOk: boolean;
  demandType: DemandType;
}): Stage {
  if (!params.budgetOk) {
    // Vai para o workflow de exceção orçamentária (tratado dentro da própria etapa
    // VALIDACAO_ORCAMENTARIA via BudgetException; só sai daqui quando aprovado/reprovado)
    return "VALIDACAO_ORCAMENTARIA";
  }
  // FERRAMENTA_UPGRADE_DOWNGRADE deliberadamente NÃO aciona Due Diligence —
  // decisão registrada: um upgrade/downgrade de versão de ferramenta já
  // homologada não repete o processo completo de privacidade/segurança.
  if (params.demandType === "FERRAMENTA_NOVA") return "DUE_DILIGENCE";
  return "COTACAO";
}

export function budgetExceptionLevel(estimatedValue: number): 1 | 2 | 3 {
  if (estimatedValue <= 5000) return 1;
  if (estimatedValue <= 25000) return 2;
  return 3;
}

/**
 * CORREÇÃO (revisão de consistência): o documento de referência definia as
 * alçadas de aprovação final como Nível 1 / 3 / 4 — sem Nível 2. Renumerado
 * aqui para 1 / 2 / 3, mantendo as mesmas faixas de valor e aprovadores.
 */
export function approvalLevel(estimatedValue: number): 1 | 2 | 3 {
  if (estimatedValue <= 50000) return 1; // Coordenação F&NC c/ procuração ou Gerente F&NC
  if (estimatedValue <= 500000) return 2; // Gerente F&NC
  return 3; // Gerente F&NC + CEO
}

export function nextAfterAprovacao(params: {
  approved: boolean;
  needsContract: boolean;
}): Stage {
  if (!params.approved) return "CANCELADO";
  return params.needsContract ? "JURIDICO" : "PEDIDO_COMPRA";
}

export function nextAfterAguardandoEntrega(params: {
  needsMeasurement: boolean;
  needsMapping: boolean;
}): Stage {
  if (params.needsMeasurement) return "MEDICAO";
  if (params.needsMapping) return "MAPEAMENTO_CONTRATO";
  return "CONCLUIDO";
}

export function nextAfterTesouraria(params: { needsMapping: boolean }): Stage {
  return params.needsMapping ? "MAPEAMENTO_CONTRATO" : "CONCLUIDO";
}

/**
 * SLA total por diretoria (usado para calcular slaDeadline na criação da
 * solicitação). Prioridade CRITICA reduz o prazo pela metade (arredondado
 * para cima) — ASSUNÇÃO NÃO VERIFICADA: o documento de referência original
 * não define uma regra de encurtamento por prioridade; este valor (metade
 * do prazo normal) é um ponto de partida e deve ser confirmado com o time
 * de Compras | F&NC antes de produção.
 */
export function slaDaysForDiretoria(
  diretoria: "CORPORATIVO" | "REVENUE" | "TECNOLOGIA",
  priority?: "BAIXA" | "MEDIA" | "ALTA" | "CRITICA"
): number {
  const base = diretoria === "CORPORATIVO" ? 30 : 45;
  return priority === "CRITICA" ? Math.ceil(base / 2) : base;
}

/**
 * Verifica se uma transição é estruturalmente válida (não substitui as regras de
 * negócio específicas acima, apenas garante que não se pule etapas por engano).
 */
export function isValidTransition(from: Stage, to: Stage): boolean {
  if (to === "CANCELADO") return true; // cancelamento é permitido a qualquer momento
  return STAGES[from].nextStages.includes(to);
}

// ============================================================================
// Adições de compliance e boas práticas de procurement (revisão pós-entrega)
// ============================================================================

/**
 * SEGREGAÇÃO DE FUNÇÃO (SoD)
 *
 * Regra básica: quem solicita não pode processar a própria solicitação como
 * comprador, nem se auto-aprovar. O documento original não previa essa checagem
 * explicitamente — ela existe aqui como uma trava estrutural, não apenas uma
 * orientação de processo.
 */
export function violatesSegregationOfDuties(params: {
  requesterId: string;
  buyerId?: string;
  approverId?: string;
}): string | null {
  if (params.buyerId && params.buyerId === params.requesterId) {
    return "O comprador responsável não pode ser o mesmo usuário que abriu a solicitação.";
  }
  if (params.approverId && params.approverId === params.requesterId) {
    return "O aprovador não pode ser o mesmo usuário que abriu a solicitação.";
  }
  return null;
}

/**
 * PERSONIFICAÇÃO DE APROVADOR — controlada, não irrestrita.
 *
 * O documento original permite ao comprador personificar qualquer aprovador em
 * caso de urgência/ausência, sem limite de valor. Isso concentra poder demais
 * numa única função. Regra revisada: personificação só é permitida até o
 * Nível 1 de alçada (R$ 50 mil) e sempre gera notificação ao aprovador real
 * (não substitui o registro de auditoria, apenas evita que a exceção vire regra
 * para valores altos).
 */
export function canPersonifyApprover(estimatedValue: number): boolean {
  return approvalLevel(estimatedValue) === 1;
}

/**
 * ANTI-FRACIONAMENTO
 *
 * Controle clássico de auditoria de compras: soma o valor de todas as
 * solicitações do mesmo fornecedor (ou, na ausência de cadastro de fornecedor,
 * mesma descrição/CNPJ) nos últimos 12 meses. Se o total ultrapassar uma
 * alçada que a soma das partes não teria individualmente disparado, sinaliza
 * para revisão da Controladoria antes de prosseguir.
 *
 * Este é um *detector*, não um bloqueio automático — decisões de bloquear
 * ficam com Controladoria/Compras, para não travar compras legítimas e
 * recorrentes de baixo risco.
 */
export function checkFragmentationRisk(params: {
  newRequestValue: number;
  priorRequestsValueLast12Months: number;
}): { flagged: boolean; combinedLevel: 1 | 2 | 3; individualLevel: 1 | 2 | 3 } {
  const combined = params.newRequestValue + params.priorRequestsValueLast12Months;
  const combinedLevel = approvalLevel(combined);
  const individualLevel = approvalLevel(params.newRequestValue);
  return { flagged: combinedLevel > individualLevel, combinedLevel, individualLevel };
}

/**
 * NÚMERO MÍNIMO DE COTAÇÕES POR FAIXA DE VALOR
 *
 * O documento original torna múltiplas cotações opcionais em qualquer valor.
 * Boas práticas de procurement pedem cotação competitiva a partir de um piso
 * baixo, com fornecedor único exigindo justificativa formal.
 */
export function minimumQuotesRequired(estimatedValue: number): number {
  if (estimatedValue <= 2500) return 1;
  return 3;
}

/**
 * FAIXAS DE RISCO ("LANES") — fast / standard / strategic
 *
 * Reintroduz o modelo de lanes já validado em conversas anteriores sobre a
 * redesenho do processo: nem toda compra precisa do fluxo completo. Fornecedor
 * já homologado (baixo risco) e valor baixo pode pular Due Diligence e usar
 * cotação única; fornecedor novo ou valor alto sempre passa pelo fluxo
 * completo, independentemente do tipo de demanda.
 */
export type ProcurementLane = "FAST" | "STANDARD" | "STRATEGIC";

export function determineLane(params: {
  estimatedValue: number;
  supplierApproved: boolean; // já homologado em compra anterior, sem pendência de compliance
  supplierRiskTier: "BAIXO" | "MEDIO" | "ALTO";
  demandType: DemandType;
  handlesPersonalData: boolean; // aciona due diligence de privacidade independente do tipo de demanda
}): ProcurementLane {
  // FERRAMENTA_UPGRADE_DOWNGRADE não entra aqui de propósito (ver mesma
  // decisão em nextAfterValidacaoOrcamentaria) — segue a faixa de risco
  // padrão por valor/fornecedor abaixo.
  if (params.handlesPersonalData || params.demandType === "FERRAMENTA_NOVA") {
    return params.estimatedValue > 500000 ? "STRATEGIC" : "STANDARD";
  }
  if (params.estimatedValue > 500000 || params.supplierRiskTier === "ALTO") return "STRATEGIC";
  if (params.estimatedValue <= 5000 && params.supplierApproved && params.supplierRiskTier === "BAIXO") {
    return "FAST";
  }
  return "STANDARD";
}

/** Devida diligência básica de fornecedor (CNPJ ativo + listas restritivas) —
 * no fluxo original só existia para Ferramenta Nova; aqui é um portão mínimo
 * para QUALQUER fornecedor novo, antes do Pedido de Compra (o due diligence de
 * privacidade/segurança continua sendo adicional, só para ferramentas). */
export function requiresBasicVendorScreening(params: { supplierIsNew: boolean }): boolean {
  return params.supplierIsNew;
}

/** Escalonamento por SLA — se um aprovador não decide dentro do prazo, o
 * sistema deve notificar (não decidir sozinho) o próximo nível hierárquico e
 * a Controladoria, para evitar que a solicitação fique parada indefinidamente. */
export const APPROVAL_ESCALATION_BUSINESS_DAYS = 3;
