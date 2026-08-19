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
