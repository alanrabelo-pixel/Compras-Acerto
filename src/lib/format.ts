/**
 * Datas "somente data" (ex: vigência de contrato) são armazenadas como
 * meia-noite UTC. Formatar com o fuso local do servidor causa exibição do
 * dia anterior em fusos atrás de UTC (ex: America/Sao_Paulo) — por isso
 * essas datas são sempre formatadas fixando timeZone: "UTC".
 */
export function formatDateOnly(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/** Data + hora (fuso local) — formato único usado em toda a tela para
 * evitar variações (com/sem segundos, com/sem zero à esquerda). */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Moeda em Real — sempre com símbolo e 2 casas decimais via Intl, em vez
 * de concatenar "R$ " manualmente na frente de um número truncado. */
export function formatCurrency(value: number | string): string {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
