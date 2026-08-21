/**
 * Acerto Compras: máquina de estados do fluxo de compras
 *
 * Este arquivo é a "fonte da verdade" das regras de transição entre etapas.
 * Cada função guard() decide se uma transição é permitida; cada effect() descreve
 * o que deve acontecer (notificações, criação de sub-registros) ao entrar na etapa.
 *
 * IMPORTANTE: os efeitos de notificação (sendEmail/sendSlack) são chamados aqui,
 * mas a implementação de envio real está em src/lib/integrations/{gmail,slack}.ts.
 * Isso mantém a lógica de negócio separada da mecânica de integração.
 */

import { faixaDoValor, ordenarFaixas, type Faixa } from "@/lib/alcadas";
import { Stage, DemandType, RoleName, Diretoria } from "@prisma/client";

export type StageDefinition = {
  stage: Stage;
  label: string;
  // Para onde essa etapa pode avançar (a decisão de qual delas é feita pelo guard)
  nextStages: Stage[];
  // Tempo esperado na etapa, em dias, por diretoria. É referência de
  // expectativa, não prazo aplicado: o único prazo que o sistema cobra é o da
  // solicitação inteira (slaDeadline, ver slaDaysForDiretoria abaixo). Etapas
  // sem valor definido ficam sem os dois campos, e a tela simplesmente não
  // mostra expectativa nenhuma, em vez de inventar um número.
  //
  // Origem dos números: as etapas até Jurídico vieram do desenho original do
  // fluxo; as de Mapa de Cotação em diante foram estimadas junto com o time em
  // ago/2026, sem medição de histórico (o sistema ainda não tinha ciclo
  // fechado para medir). Revisar quando houver dado real de duração por etapa,
  // que os painéis já coletam via StageEvent.
  slaDaysCorporativo?: number;
  slaDaysTecnologiaRevenue?: number;
};

export const STAGES: Record<Stage, StageDefinition> = {
  SOLICITACAO: {
    stage: "SOLICITACAO",
    label: "Solicitação de Compra",
    // Sem tempo de referência: é o próprio formulário, não existe espera.
    // Vai direto para Triagem: ver a nota de legado em APROVACAO_GESTOR.
    nextStages: ["TRIAGEM"],
  },
  /**
   * LEGADO. Fora do fluxo desde 21/08/2026, por decisão do dono do sistema:
   * a solicitação aberta vai direto para a Triagem, e quem faz o primeiro
   * crivo é o comprador. O controle de gasto sem orçamento não se perdeu, só
   * mudou de lugar: quem marca Orçamento Extra na abertura já cai no fluxo de
   * exceção da Validação Orçamentária, com aprovador definido pelo valor
   * (budgetExceptionLevel), e a alçada financeira continua na etapa Aprovação.
   *
   * A entrada continua aqui por três motivos: STAGES é um Record de todas as
   * etapas do enum; o enum não perdeu o valor, para não exigir migration; e
   * StageEvent de solicitações antigas ainda aponta para cá, então apagar
   * quebraria o histórico. Nenhuma solicitação estava nesta etapa quando ela
   * saiu do fluxo, e nenhuma tinha decisão de gestor gravada.
   *
   * O quadro e os seletores de etapa filtram esta entrada (ver
   * src/app/solicitacoes/page.tsx), do mesmo jeito que já filtravam CANCELADO.
   */
  APROVACAO_GESTOR: {
    stage: "APROVACAO_GESTOR",
    label: "Aprovação do Gestor (legado)",
    nextStages: ["TRIAGEM", "CANCELADO"],
    slaDaysCorporativo: 1,
    slaDaysTecnologiaRevenue: 2,
  },
  TRIAGEM: {
    stage: "TRIAGEM",
    label: "Homologação e Triagem",
    // JURIDICO: atalho para demandType CANCELAMENTO. Cancelamento de
    // contrato/serviço/ferramenta não precisa do fluxo completo de compra
    // (orçamento/cotação/aprovação/pedido de compra), só formalização jurídica
    // e registro em Contrato. Ver nextStages de JURIDICO abaixo.
    nextStages: ["VALIDACAO_ORCAMENTARIA", "JURIDICO", "CANCELADO"],
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
    slaDaysCorporativo: 1,
    slaDaysTecnologiaRevenue: 2,
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
    // CONCLUIDO: destino para demandType CANCELAMENTO. Depois de assinado o
    // distrato/termo de cancelamento, encerra direto, sem Pedido de Compra
    // nem Mapeamento de Contrato (o contrato já existe e mapeado; cancelá-lo
    // de fato é feito em Contratos, ver ação CANCELAR em /api/contracts/[id]).
    nextStages: ["PEDIDO_COMPRA", "CONCLUIDO"],
    slaDaysCorporativo: 20,
    slaDaysTecnologiaRevenue: 30,
  },
  PEDIDO_COMPRA: {
    stage: "PEDIDO_COMPRA",
    label: "Pedido de Compra",
    nextStages: ["AGUARDANDO_ENTREGA"],
    slaDaysCorporativo: 1,
    slaDaysTecnologiaRevenue: 1,
  },
  AGUARDANDO_ENTREGA: {
    stage: "AGUARDANDO_ENTREGA",
    label: "Aguardando Entrega/Conclusão",
    // Se precisa de medição -> Medição; senão -> Mapeamento de Contrato (se aplicável) ou Concluído
    // Sem tempo de referência de propósito: quem manda aqui é o prazo de
    // entrega combinado com o fornecedor, que varia a cada compra. Um número
    // fixo aqui seria expectativa falsa.
    nextStages: ["MEDICAO", "MAPEAMENTO_CONTRATO", "CONCLUIDO"],
  },
  MEDICAO: {
    stage: "MEDICAO",
    label: "Medição e Aprovação Financeira",
    nextStages: ["FISCAL"],
    slaDaysCorporativo: 2,
    slaDaysTecnologiaRevenue: 2,
  },
  FISCAL: {
    stage: "FISCAL",
    label: "Validação Fiscal",
    nextStages: ["TESOURARIA"],
    slaDaysCorporativo: 2,
    slaDaysTecnologiaRevenue: 2,
  },
  TESOURARIA: {
    stage: "TESOURARIA",
    label: "Tesouraria (Pagamento)",
    nextStages: ["MAPEAMENTO_CONTRATO", "CONCLUIDO"],
    slaDaysCorporativo: 3,
    slaDaysTecnologiaRevenue: 3,
  },
  MAPEAMENTO_CONTRATO: {
    stage: "MAPEAMENTO_CONTRATO",
    label: "Mapeamento de Contrato",
    nextStages: ["CONCLUIDO"],
    slaDaysCorporativo: 2,
    slaDaysTecnologiaRevenue: 2,
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
 * Etapas que existem no enum mas não viram coluna do quadro nem opção de
 * seletor. Uma lista só, em vez de `!== "CANCELADO"` repetido em cada tela:
 * quando a segunda etapa oculta apareceu, o filtro espalhado teria de ser
 * caçado em cinco arquivos, e quem esquecesse um deixaria uma coluna vazia.
 *
 * CANCELADO: sempre teve visão própria, nunca foi coluna.
 * APROVACAO_GESTOR: fora do fluxo desde 21/08/2026, mantida no enum só para o
 * histórico continuar resolvendo (ver a nota de legado na entrada dela).
 */
export const ETAPAS_OCULTAS_NO_QUADRO: readonly Stage[] = ["CANCELADO", "APROVACAO_GESTOR"];

export function etapaVisivelNoQuadro(stage: Stage): boolean {
  return !ETAPAS_OCULTAS_NO_QUADRO.includes(stage);
}

/**
 * Tempo esperado na etapa atual, em dias, para a diretoria da solicitação.
 *
 * Os números de STAGES existiam desde o começo e nunca eram lidos por
 * ninguém: ficavam no código como documentação que a tela não mostrava. Aqui
 * eles viram o que sempre foram na prática, uma expectativa de quanto a etapa
 * costuma levar, exibida para quem está esperando. Nada é bloqueado nem
 * marcado como atrasado a partir daqui.
 *
 * Sem diretoria definida, usa a referência de Corporativo, que é a mais
 * apertada das duas: melhor uma expectativa conservadora do que otimista.
 */
export function expectativaDaEtapa(stage: Stage, diretoria: Diretoria | null | undefined): number | null {
  const definicao = STAGES[stage];
  const dias =
    diretoria === "TECNOLOGIA" || diretoria === "REVENUE"
      ? definicao.slaDaysTecnologiaRevenue
      : definicao.slaDaysCorporativo;
  return dias ?? null;
}

/**
 * Regras de roteamento condicional: a "inteligência" que decide o próximo
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
  // FERRAMENTA_UPGRADE_DOWNGRADE deliberadamente NÃO aciona Due Diligence:
  // decisão registrada: um upgrade/downgrade de versão de ferramenta já
  // homologada não repete o processo completo de privacidade/segurança.
  if (params.demandType === "FERRAMENTA_NOVA") return "DUE_DILIGENCE";
  return "COTACAO";
}

/**
 * Alçada da exceção orçamentária. DOIS níveis, com corte em R$ 10 mil
 * (decisão do dono do sistema em 21/08/2026).
 *
 * Antes eram três faixas (5 mil / 25 mil / acima), mas os níveis 2 e 3
 * apontavam para o MESMO papel, Gerente F&NC: a fronteira dos 25 mil não
 * mudava quem decidia, só o rótulo. Duas faixas para dois papéis é a forma
 * honesta da mesma regra.
 *
 * Não confundir com approvalLevel() logo abaixo, que é a alçada da APROVAÇÃO
 * FINAL e tem outra escada (50 mil / 500 mil) e outro efeito (número de
 * assinaturas). São dois controles independentes.
 */
export function budgetExceptionLevel(estimatedValue: number): 1 | 2 {
  return estimatedValue <= 10000 ? 1 : 2;
}

/**
 * Papel exigido para decidir uma exceção orçamentária, por alçada. Pedido
 * explícito do usuário: antes, qualquer pessoa com papel Controladoria
 * decidia exceção de qualquer nível, sem diferenciar pela alçada calculada
 * acima. Decisão do usuário: manter só dois papéis (Coordenação / Gerente
 * F&NC), sem CEO. Nível 1 exige Coordenação, Nível 2 exige Gerente F&NC.
 */
export function budgetExceptionApproverRole(level: 1 | 2): RoleName {
  return level === 1 ? "COORDENACAO" : "GERENTE_FNC";
}

export const BUDGET_EXCEPTION_LEVEL_LABEL: Record<1 | 2, string> = {
  1: "Nível 1 (até R$ 10 mil): Coordenação",
  2: "Nível 2 (acima de R$ 10 mil): Gerente F&NC",
};

/**
 * A alçada da APROVAÇÃO FINAL saiu daqui em 21/08/2026.
 *
 * Era `approvalLevel(valor)`, com 50 mil e 500 mil escritos no código e o
 * tipo `1 | 2 | 3` propagado por toda parte. Virou tabela (ApprovalTier), para
 * o dono do sistema incluir, editar e desativar faixas pela tela. A escolha
 * da faixa agora é `faixaDoValor(faixas, valor)` em @/lib/alcadas, pura, e
 * quem carrega as faixas é `faixasAtivas()`, no servidor.
 *
 * As funções abaixo que dependiam dela passaram a receber as faixas como
 * argumento, pelo mesmo motivo: manter regra de negócio testável sem banco.
 *
 * Não confundir com budgetExceptionLevel, logo acima: aquela é a alçada da
 * EXCEÇÃO ORÇAMENTÁRIA, continua no código, e tem outra escada (10 mil) e
 * outro efeito (qual papel decide, não quantas assinaturas).
 */

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
 * para cima). ASSUNÇÃO NÃO VERIFICADA: o documento de referência original
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
 * PERSONIFICAÇÃO DE APROVADOR: controlada, não irrestrita.
 *
 * O documento original permite ao comprador personificar qualquer aprovador em
 * caso de urgência/ausência, sem limite de valor. Isso concentra poder demais
 * numa única função. Regra revisada: personificação só é permitida até o
 * Nível 1 de alçada (R$ 50 mil) e sempre gera notificação ao aprovador real
 * (não substitui o registro de auditoria, apenas evita que a exceção vire regra
 * para valores altos).
 */
export function canPersonifyApprover(faixas: Faixa[], estimatedValue: number): boolean {
  // "Até o Nível 1" virou "até a faixa mais baixa configurada": com as faixas
  // editáveis, o número 1 deixou de ser sinônimo de menor valor. A regra que
  // interessa é a mesma de antes, personificar só nas compras pequenas, e
  // agora ela acompanha a escada quando alguém mexe nela.
  const maisBaixa = ordenarFaixas(faixas)[0];
  const faixa = faixaDoValor(faixas, estimatedValue);
  // Sem faixa configurada, ninguém personifica: na dúvida, o caminho é o
  // aprovador real decidir.
  return Boolean(maisBaixa && faixa && faixa.level === maisBaixa.level);
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
 * Este é um *detector*, não um bloqueio automático: decisões de bloquear
 * ficam com Controladoria/Compras, para não travar compras legítimas e
 * recorrentes de baixo risco.
 */
export function checkFragmentationRisk(params: {
  faixas: Faixa[];
  newRequestValue: number;
  priorRequestsValueLast12Months: number;
}): { flagged: boolean; combinedLevel: number; individualLevel: number } {
  const combined = params.newRequestValue + params.priorRequestsValueLast12Months;
  const ordenadas = ordenarFaixas(params.faixas);
  // A comparação é por POSIÇÃO na escada, não pelo número da faixa: `level` é
  // identidade estável e uma faixa criada depois pode ter número maior e teto
  // menor. Comparar os números diria que a compra subiu de alçada quando ela
  // não subiu, e o alerta de fracionamento sairia errado.
  const posicao = (valor: number) => ordenadas.findIndex((f) => f.maxValue === null || valor <= f.maxValue);
  const posCombinada = posicao(combined);
  const posIndividual = posicao(params.newRequestValue);

  const faixaCombinada = ordenadas[posCombinada];
  const faixaIndividual = ordenadas[posIndividual];
  return {
    flagged: posCombinada > posIndividual,
    combinedLevel: faixaCombinada?.level ?? 0,
    individualLevel: faixaIndividual?.level ?? 0,
  };
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
 * FAIXAS DE RISCO ("LANES"): fast / standard / strategic
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
  // decisão em nextAfterValidacaoOrcamentaria): segue a faixa de risco
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

/** Devida diligência básica de fornecedor (CNPJ ativo + listas restritivas):
 * no fluxo original só existia para Ferramenta Nova; aqui é um portão mínimo
 * para QUALQUER fornecedor novo, antes do Pedido de Compra (o due diligence de
 * privacidade/segurança continua sendo adicional, só para ferramentas). */
export function requiresBasicVendorScreening(params: { supplierIsNew: boolean }): boolean {
  return params.supplierIsNew;
}

/** Escalonamento por SLA: se um aprovador não decide dentro do prazo, o
 * sistema deve notificar (não decidir sozinho) o próximo nível hierárquico e
 * a Controladoria, para evitar que a solicitação fique parada indefinidamente. */
export const APPROVAL_ESCALATION_BUSINESS_DAYS = 3;

/**
 * Soma dias ÚTEIS a uma data, pulando sábado e domingo.
 *
 * O prazo de escalonamento se chamava "dias úteis" e era calculado somando
 * dias corridos: uma aprovação aberta numa quinta vencia no domingo, e o
 * aprovador era cobrado por um atraso que incluía o fim de semana. O nome
 * dizia uma coisa e a conta fazia outra.
 *
 * Não considera feriado: seria preciso uma tabela de feriados nacionais e
 * locais, que o sistema não tem. Fica registrado como limitação conhecida, em
 * vez de fingir precisão que não existe.
 */
export function somarDiasUteis(inicio: Date, dias: number): Date {
  const resultado = new Date(inicio);
  let restantes = dias;
  while (restantes > 0) {
    resultado.setDate(resultado.getDate() + 1);
    const diaDaSemana = resultado.getDay();
    if (diaDaSemana !== 0 && diaDaSemana !== 6) restantes--;
  }
  return resultado;
}
