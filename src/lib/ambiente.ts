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

function bruto(): string {
  return (process.env.APP_ENV ?? "").trim().toLowerCase();
}

export function ambienteAtual(): Ambiente {
  return (VALIDOS as string[]).includes(bruto()) ? (bruto() as Ambiente) : "sandbox";
}

/**
 * Se APP_ENV traz mesmo um dos dois valores válidos, ou se o "sandbox" acima é
 * apenas o padrão de quem não disse nada.
 *
 * A distinção existe porque as duas situações têm gravidades opostas para quem
 * está validando a configuração. "Declarei que sou Sandbox e estou ligado ao
 * banco de produção" é um erro grave e conhecido. "Não declarei nada" é uma
 * lacuna, e tratá-la como se fosse a primeira derrubava a subida de um ambiente
 * de produção legítimo que só não conhecia esta variável, como aconteceu em
 * 25/08/2026 com o overlay do time de engenharia, escrito antes de APP_ENV
 * existir. Ver src/lib/env.ts.
 *
 * O padrão seguro de ambienteAtual() continua igual: quem não se declara não
 * manda e-mail nem Slack, e vê a faixa de Sandbox na tela.
 */
export function ambienteFoiDeclarado(): boolean {
  return (VALIDOS as string[]).includes(bruto());
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

/**
 * Título da aba do navegador. A faixa só resolve depois que a pessoa já está
 * olhando a tela; escolher entre duas abas acontece antes disso, e com
 * Produção e Sandbox abertos lado a lado as duas se chamavam exatamente
 * "Acerto Compras". O rótulo vai na frente porque é o fim do título que some
 * quando há muitas abas abertas, e em produção o título fica intocado, pela
 * mesma razão de rotuloDoAmbiente(): marca permanente vira paisagem.
 */
export function tituloDaAba(base: string): string {
  const rotulo = rotuloDoAmbiente();
  return rotulo ? `[${rotulo}] ${base}` : base;
}
