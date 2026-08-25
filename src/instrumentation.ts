/**
 * Conferência de ambiente na SUBIDA DO SERVIDOR, e ENCERRAMENTO do processo se
 * ela falhar.
 *
 * O QUE ISTO EVITA, concretamente. validarAmbiente() já era chamada no escopo de
 * módulo de src/lib/auth.ts, ou seja, quando a primeira requisição autenticada
 * chega. Num container isso é tarde demais: o processo sobe, responde, o
 * Kubernetes marca o pod como pronto, DESLIGA OS PODS ANTIGOS, e só então o
 * primeiro login descobre que falta variável. O sistema fica fora do ar com a
 * configuração que funcionava já removida.
 *
 * POR QUE O process.exit É NECESSÁRIO, e não é exagero. Lançar aqui NÃO derruba
 * o servidor. Medido no standalone real em 25/08/2026, com a configuração exata
 * da produção:
 *
 *     Failed to prepare server Error: An error occurred while loading
 *     instrumentation hook: APP_ENV=sandbox com DATABASE_URL apontando para...
 *     ✓ Ready in 173ms
 *
 * O Next 14 registra a falha, imprime "Ready" logo abaixo e SEGUE VIVO. O
 * processo continuou de pé, aceitou conexão TCP e respondeu HTTP 500 em `/` e em
 * `/login`. Para o Kubernetes isso é um pod saudável: a porta atende. A
 * substituição conclui, os pods antigos morrem, e o site inteiro fica em 500.
 *
 * Encerrando explicitamente, o pod morre antes de atender qualquer conexão, a
 * checagem de prontidão nunca passa, a substituição para no meio e os pods
 * antigos continuam servindo. Uma implantação malconfigurada deixa de substituir
 * uma que está funcionando.
 *
 * O CONTEXTO DE 25/08/2026: a validação nasceu em 19/08, depois de o time de
 * engenharia ter partido daqui, e depende de três variáveis que são nossas e não
 * existem na configuração de deploy deles: APP_ENV, APP_URL e
 * AI_KEY_ENCRYPTION_SECRET. Sem APP_ENV, ambienteAtual() assume "sandbox" (ver
 * src/lib/ambiente.ts), e a trava que recusa Sandbox ligado a banco remoto sem
 * marca de sandbox no nome dispara justamente contra a produção de verdade, que
 * é remota e não tem essa marca.
 *
 * Isto não afrouxa nada: as mesmas regras, no mesmo lugar, só mais cedo e com a
 * consequência certa. A chamada em src/lib/auth.ts continua onde está, porque
 * nem todo caminho de execução passa por aqui (teste, script, rota chamada
 * direto).
 */

/** Injetável só para o teste poder observar a decisão sem matar o vitest. */
export type Encerrador = (codigo: number) => void;

const encerrarDeVerdade: Encerrador = (codigo) => process.exit(codigo);

export async function register(sair: Encerrador = encerrarDeVerdade): Promise<void> {
  // Só no runtime Node. O middleware roda no runtime edge, que não tem as mesmas
  // variáveis e onde encerrar o processo derrubaria a aplicação inteira com um
  // erro difícil de ler, mesma razão pela qual assertBypassNaoEstaEmProducao()
  // também não é chamada de lá.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Import dinâmico de propósito: instrumentation.ts é carregado pelo Next antes
  // do grafo de módulos do app, e importar @/lib/env no topo arrastaria o logger
  // para dentro do bundle de instrumentação sem necessidade.
  const { validarAmbiente } = await import("@/lib/env");

  try {
    validarAmbiente();
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    // console.error, e não o logger: este é o último texto que sai antes de o
    // processo morrer, e precisa aparecer no log do pod sem depender de mais
    // nenhum módulo ter carregado corretamente.
    console.error(
      [
        "",
        "  [boot] O SERVIDOR NAO VAI SUBIR. Configuracao de ambiente invalida:",
        `  [boot] ${motivo}`,
        "  [boot] Encerrando o processo de proposito, para que esta implantacao",
        "  [boot] nao substitua a que esta funcionando.",
        "",
      ].join("\n"),
    );
    sair(1);
  }
}
