import { logger } from "@/lib/logger";

/**
 * Conferência das variáveis de ambiente na inicialização.
 *
 * Antes não existia validação nenhuma: 20 variáveis eram lidas direto de
 * process.env espalhadas pelo código, e a ausência de cada uma se manifestava
 * de um jeito diferente e tardio. Os piores casos eram silenciosos:
 *
 * - APP_URL ausente: os links dos e-mails viravam "undefined/solicitacoes/...".
 *   O e-mail é enviado normalmente e ninguém percebe até alguém clicar.
 * - BLOB_READ_WRITE_TOKEN ausente em produção: o armazenamento cai para disco
 *   local, que é efêmero na Vercel. O upload funciona, o anexo é gravado no
 *   banco, e os arquivos somem no deploy seguinte.
 *
 * A distinção entre as duas listas é deliberada. Falta de segredo de
 * autenticação impede o sistema de operar com segurança, então derruba o boot.
 * Falta de credencial de integração degrada uma funcionalidade, e o sistema foi
 * desenhado para que integração falhe em silêncio sem travar o fluxo de
 * compras, então isso só avisa.
 */

/** Sem estas, o sistema não pode operar com segurança em produção. */
const OBRIGATORIAS_EM_PRODUCAO = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "AI_KEY_ENCRYPTION_SECRET",
  "APP_URL",
] as const;

/** Sem estas, alguma funcionalidade para de funcionar, mas o sistema opera. */
const RECOMENDADAS_EM_PRODUCAO = [
  "CRON_SECRET",
  "ERP_API_KEY",
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "BLOB_READ_WRITE_TOKEN",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
] as const;

/** O que cada variável recomendada quebra quando falta. */
const CONSEQUENCIA: Record<string, string> = {
  CRON_SECRET: "os crons de escalonamento e de alerta de contrato recusam toda chamada",
  ERP_API_KEY: "a API de integração com o ERP recusa toda chamada",
  SLACK_BOT_TOKEN: "nenhuma mensagem de Slack é enviada",
  SLACK_SIGNING_SECRET: "o webhook do Slack recusa todos os eventos recebidos",
  BLOB_READ_WRITE_TOKEN: "anexos vão para disco efêmero e somem no próximo deploy",
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "nenhum e-mail é enviado",
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "nenhum e-mail é enviado",
};

export function validarAmbiente(): void {
  const producao = process.env.NODE_ENV === "production";

  // DATABASE_URL vale em qualquer ambiente: sem ela nada funciona.
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não está definida. O sistema não tem como acessar o banco de dados.");
  }

  if (!producao) return;

  const faltando = OBRIGATORIAS_EM_PRODUCAO.filter((nome) => !process.env[nome]);
  if (faltando.length > 0) {
    throw new Error(
      `Variáveis obrigatórias ausentes em produção: ${faltando.join(", ")}. ` +
        "Ver .env.example para o que cada uma faz. O boot foi interrompido de propósito: " +
        "sem elas o sistema operaria sem autenticação confiável."
    );
  }

  const ausentes = RECOMENDADAS_EM_PRODUCAO.filter((nome) => !process.env[nome]);
  for (const nome of ausentes) {
    logger.warn("variavel_de_ambiente_ausente", { variavel: nome, consequencia: CONSEQUENCIA[nome] });
  }
}
