import crypto from "crypto";
import { logger } from "@/lib/logger";

/**
 * Verificação dos tokens de máquina (crons e ERP).
 *
 * Corrige duas falhas do padrão anterior, que era simplesmente
 * `if (auth !== ` + "`Bearer ${process.env.CRON_SECRET}`" + `)`:
 *
 * 1. FALHA ABERTA. Sem a variável definida, a interpolação produz a string
 *    "Bearer undefined", então quem enviasse exatamente esse cabeçalho era
 *    autenticado. A ausência de configuração virava credencial válida.
 *
 * 2. COMPARAÇÃO NÃO CONSTANTE. `!==` em string termina no primeiro byte
 *    diferente. Sem limite de requisições, dá tempo de promediar o ruído de
 *    rede e recuperar o token byte a byte. O webhook do Slack neste mesmo
 *    projeto já usava timingSafeEqual corretamente; era inconsistência interna.
 */
export function verificarTokenDeMaquina(
  cabecalhoAuthorization: string | null,
  nomeDaVariavel: "CRON_SECRET" | "ERP_API_KEY"
): { ok: true } | { ok: false; status: 401 | 503; erro: string } {
  const segredo = process.env[nomeDaVariavel];

  if (!segredo) {
    // Recusa em vez de aceitar. 503 e não 401 porque o problema é de
    // configuração do servidor, não da credencial de quem chamou, e a
    // distinção é o que permite diagnosticar isso num painel de erros.
    logger.error("token_de_maquina_nao_configurado", { variavel: nomeDaVariavel });
    return {
      ok: false,
      status: 503,
      erro: "Integração não configurada neste ambiente. Procure quem administra o sistema.",
    };
  }

  if (!cabecalhoAuthorization) {
    return { ok: false, status: 401, erro: "Credencial de integração ausente." };
  }

  const esperado = Buffer.from(`Bearer ${segredo}`);
  const recebido = Buffer.from(cabecalhoAuthorization);
  // timingSafeEqual lança se os tamanhos diferem, então o comprimento é
  // comparado antes. Isso vaza o tamanho do token, o que é aceitável.
  if (esperado.length !== recebido.length || !crypto.timingSafeEqual(esperado, recebido)) {
    return { ok: false, status: 401, erro: "Credencial de integração inválida." };
  }

  return { ok: true };
}
