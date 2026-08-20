/**
 * Qual ambiente é este.
 *
 * Por que uma variável nova, em vez de reaproveitar NODE_ENV: o Next define
 * NODE_ENV sozinho e só com dois valores, `development` em `next dev` e
 * `production` em `next start`. Isso deixa o Sandbox num beco. Rodando
 * `next start`, que é a paridade real com produção, ele seria tratado como
 * produção em cinco pontos do código (ver src/lib/bypass.ts e src/lib/env.ts).
 * Rodando `next dev` para escapar disso, perderia a validação de ambiente e
 * deixaria de detectar exatamente as configurações erradas que ele existe para
 * pegar antes de produção.
 *
 * APP_ENV separa as duas perguntas, que sempre foram diferentes:
 * NODE_ENV responde "estou compilado para produção", APP_ENV responde "eu SOU
 * a produção". Um Sandbox é NODE_ENV=production e APP_ENV=sandbox.
 *
 * Ausente, o valor é `sandbox`. O padrão é o lado seguro de propósito: um
 * ambiente que esqueceu de se declarar deve se comportar como o que não pode
 * mandar e-mail para ninguém, nunca como o que pode.
 */
export type Ambiente = "producao" | "sandbox";

const VALIDOS: Ambiente[] = ["producao", "sandbox"];

export function ambienteAtual(): Ambiente {
  const bruto = (process.env.APP_ENV ?? "").trim().toLowerCase();
  return (VALIDOS as string[]).includes(bruto) ? (bruto as Ambiente) : "sandbox";
}

export function ehProducao(): boolean {
  return ambienteAtual() === "producao";
}

/**
 * Rótulo curto para a faixa da interface e para o carimbo do log. Produção não
 * tem rótulo: mostrar "PRODUÇÃO" o tempo todo faria a tarja virar paisagem, e
 * aí ela pararia de avisar justamente quando aparecesse no lugar errado.
 */
export function rotuloDoAmbiente(): string | null {
  return ehProducao() ? null : "SANDBOX";
}
