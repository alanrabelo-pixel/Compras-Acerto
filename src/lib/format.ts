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
