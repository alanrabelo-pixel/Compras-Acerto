/**
 * Rótulos legíveis dos valores de enum, num lugar só.
 *
 * O problema que isto resolve: os mapas existiam, mas espalhados e aplicados de
 * forma irregular, campo a campo. PRIORITY_LABEL estava definido em
 * dashboard-data.ts e NUNCA era usado em tela nenhuma, então em cinco telas a
 * pessoa lia "CRITICA", "MEDIA" e "BAIXA", sem acento e em caixa alta.
 * DEMAND_TYPE_LABEL existia duplicado em dois arquivos e era ignorado nas telas
 * de detalhe. Status de contrato e de pagamento não tinham mapa nenhum.
 *
 * Nada aqui é regra de negócio: é só tradução do vocabulário interno do banco
 * para o vocabulário de quem usa o sistema.
 */

export const PRIORITY_LABEL: Record<string, string> = {
  CRITICA: "Crítica",
  ALTA: "Alta",
  MEDIA: "Média",
  BAIXA: "Baixa",
};

export const DEMAND_TYPE_LABEL: Record<string, string> = {
  COMPRA_PRODUTO: "Compra de Produtos",
  COMPRA_SERVICO: "Compra de Serviço",
  FERRAMENTA_NOVA: "Compra de Nova Ferramenta",
  FERRAMENTA_USUARIOS: "Ferramentas: Inclusão/remoção de usuários",
  FERRAMENTA_UPGRADE_DOWNGRADE: "Ferramentas: Upgrade/Downgrade",
  RENOVACAO_CONTRATO: "Renovação de Contrato",
  CANCELAMENTO: "Cancelamento de Contrato/Serviço/Ferramenta",
};

/** Status da solicitação de compra. */
export const STATUS_LABEL: Record<string, string> = {
  ABERTO: "Aberto",
  CONCLUIDO: "Concluído",
  CANCELADO: "Cancelado",
};

export const CONTRACT_STATUS_LABEL: Record<string, string> = {
  ATIVO: "Ativo",
  RENOVACAO_EM_ANDAMENTO: "Renovação em andamento",
  CANCELADO: "Cancelado",
};

/** Risco cadastral do fornecedor (Supplier.riskTier). */
export const RISK_TIER_LABEL: Record<string, string> = {
  BAIXO: "Risco baixo",
  MEDIO: "Risco médio",
  ALTO: "Risco alto",
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PROGRAMADO: "Programado",
  PAGO: "Pago",
};

/**
 * Traduz um valor, devolvendo o próprio valor quando não há rótulo.
 *
 * O fallback é proposital: um enum novo que ainda não tenha rótulo aparece cru,
 * feio mas correto, em vez de sumir da tela. Some é pior, porque ninguém
 * percebe.
 */
export function rotulo(mapa: Record<string, string>, valor: string | null | undefined): string {
  if (!valor) return "";
  return mapa[valor] ?? valor;
}

/**
 * Nome dos campos do jeito que aparecem no formulário.
 *
 * As mensagens de erro da API interpolavam a chave do objeto direto, então a
 * pessoa lia "Campo obrigatório ausente: shortDescription" ou
 * "supplierLegalName". O nome interno do campo não ajuda quem está preenchendo
 * a tela: ele precisa do rótulo que está vendo.
 */
export const CAMPO_LABEL: Record<string, string> = {
  // Nova Solicitação
  requesterId: "Solicitante",
  diretoria: "Diretoria",
  costCenterId: "Centro de Custo",
  leadershipPreApproved: "Alinhamento com a liderança",
  budgetLineText: "Linha do Orçamento",
  priority: "Prioridade",
  demandType: "Tipo de Demanda",
  shortDescription: "Descrição Resumida",
  longDescription: "Descrição Detalhada",
  suggestedDeadline: "Prazo Sugerido",
  quantity: "Quantidade",
  estimatedValue: "Valor Estimado",
  // Detalhamento do Orçamento Extra (modal da abertura).
  extraBudgetBasis: "Base do valor (mensal, anual ou total)",
  extraBudgetStart: "Início da vigência",
  extraBudgetEnd: "Fim da vigência",
  extraBudgetImpact: "Impacto financeiro (recorrente ou pontual)",
  extraBudgetJustification: "Motivo de não estar no orçamento original",
  // Pedido de Compra
  supplierLegalName: "Razão Social do fornecedor",
  supplierCnpj: "CNPJ do fornecedor",
  contactName: "Nome do contato",
  contactPhone: "Telefone do contato",
  contactEmail: "E-mail do contato",
  initialValue: "Valor inicial",
  negotiatedValue: "Valor negociado",
  paymentCondition: "Condição de pagamento",
  installments: "Número de parcelas",
  prazoEntrega: "Prazo de entrega",
  localEntrega: "Local de entrega",
  // Mapeamento de Contrato
  supplierName: "Razão Social do fornecedor",
  startDate: "Início da vigência",
  endDate: "Fim da vigência",
  renewalDate: "Renovação prevista",
  contractManagerId: "Gestor do contrato",
  area: "Área",
  // Outras etapas
  documentUrl: "Link do documento",
  scopeExecuted: "Escopo executado",
  erpExternalId: "Identificador no ERP",
  declaredBy: "Quem declara",
  hasConflict: "Há conflito de interesse",
  uploadedBy: "Quem está anexando",
  authorName: "Nome de quem escreve",
  title: "Título",
  body: "Mensagem",
  requesterName: "Nome do solicitante",
  requesterEmail: "E-mail do solicitante",
  description: "Descrição",
  name: "Nome",
};

/** Rótulo de um campo, com o nome interno como último recurso. */
export function campo(chave: string): string {
  return CAMPO_LABEL[chave] ?? chave;
}
