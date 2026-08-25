/**
 * Conferência de ambiente na SUBIDA DO SERVIDOR, não na primeira requisição.
 *
 * O QUE ISTO EVITA, concretamente. validarAmbiente() já era chamada no escopo
 * de módulo de src/lib/auth.ts, e ali ela roda quando alguém importa aquele
 * módulo, ou seja, quando a primeira requisição autenticada chega. Num
 * container isso é tarde demais: o processo sobe, responde, o Kubernetes marca
 * o pod como pronto, DESLIGA OS PODS ANTIGOS, e só então o primeiro login
 * descobre que falta variável. O sistema fica fora do ar com a configuração
 * antiga já removida.
 *
 * Rodando aqui, a mesma falha acontece antes de o servidor aceitar qualquer
 * conexão. O pod morre na largada, a checagem de prontidão nunca passa, a
 * substituição para no meio e os pods antigos continuam atendendo. O deploy
 * falha de forma visível, que é o resultado desejado: uma implantação
 * malconfigurada não deve substituir uma que está funcionando.
 *
 * POR QUE ISTO É NECESSÁRIO AGORA (25/08/2026). A validação nasceu em 19/08,
 * depois de o time de engenharia ter partido daqui, e depende de três
 * variáveis que são nossas e não existem na configuração de deploy deles:
 * APP_ENV, APP_URL e AI_KEY_ENCRYPTION_SECRET. Sem APP_ENV, ambienteAtual()
 * assume "sandbox" (ver src/lib/ambiente.ts), e a trava que recusa Sandbox
 * ligado a banco remoto sem marca de sandbox no nome derruba justamente a
 * produção de verdade, que é remota e não tem essa marca.
 *
 * Isto não afrouxa nada: as mesmas regras, no mesmo lugar, só mais cedo. A
 * chamada em src/lib/auth.ts continua onde está, porque nem todo caminho de
 * execução passa por aqui (teste, script, rota chamada direto).
 */
export async function register() {
  // Só no runtime Node. O middleware roda no runtime edge, que não tem acesso
  // às mesmas variáveis nem faz sentido validar duas vezes; e lançar no edge
  // derruba a aplicação inteira com um erro difícil de ler, que é a razão de
  // assertBypassNaoEstaEmProducao() também não ser chamada de lá.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Import dinâmico de propósito: instrumentation.ts é carregado pelo Next em
  // contextos onde o grafo de módulos do app ainda não existe, e importar
  // @/lib/env no topo arrastaria o logger e a leitura de ambiente para dentro
  // do bundle de instrumentação sem necessidade.
  const { validarAmbiente } = await import("@/lib/env");
  validarAmbiente();
}
