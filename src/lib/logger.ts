/**
 * Log estruturado mínimo, sem dependência externa.
 *
 * Antes existia UMA chamada de console em todo o src/, e nenhum logger, APM ou
 * rastreamento. Quando algo quebrasse em produção não haveria como responder o
 * que quebrou, quando começou, quem foi afetado ou qual a taxa de erro.
 *
 * Emite uma linha JSON por evento, que é o formato que qualquer agregador
 * (Datadog, que a Acerto já usa, entre outros) consome sem parser próprio.
 * Deliberadamente simples: trocar isto por uma biblioteca depois é mudar este
 * arquivo, não os pontos de chamada.
 */

type Nivel = "info" | "warn" | "error";

/** Campos que nunca devem ir para o log, mesmo que apareçam no contexto. */
const CAMPOS_SENSIVEIS = [
  "password", "senha", "token", "secret", "apikey", "api_key",
  "anthropicapikey", "geminiapikey", "authorization", "cookie",
];

function limpar(dados: Record<string, unknown>): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(dados)) {
    if (CAMPOS_SENSIVEIS.includes(chave.toLowerCase())) {
      saida[chave] = "[omitido]";
      continue;
    }
    // Error não serializa em JSON.stringify: vira {} e o motivo do erro some,
    // que é justamente o que se quer ler no log.
    if (valor instanceof Error) {
      saida[chave] = { nome: valor.name, mensagem: valor.message, stack: valor.stack };
      continue;
    }
    saida[chave] = valor;
  }
  return saida;
}

function emitir(nivel: Nivel, evento: string, dados: Record<string, unknown> = {}) {
  const linha = JSON.stringify({
    nivel,
    evento,
    momento: new Date().toISOString(),
    ...limpar(dados),
  });
  if (nivel === "error") console.error(linha);
  else if (nivel === "warn") console.warn(linha);
  else console.log(linha);
}

export const logger = {
  info: (evento: string, dados?: Record<string, unknown>) => emitir("info", evento, dados),
  warn: (evento: string, dados?: Record<string, unknown>) => emitir("warn", evento, dados),
  error: (evento: string, dados?: Record<string, unknown>) => emitir("error", evento, dados),
};
