/**
 * Ponto único de leitura de LOCAL_BYPASS_AUTH.
 *
 * Essa flag existe para desenvolver sem o Google OAuth configurado, mas ela não
 * desliga só o login: desliga também a comparação entre sessão e ator em
 * requireRole (src/lib/rbac.ts) e abre todas as rotas administrativas. Ou seja,
 * ligada, o sistema fica sem controle de acesso nenhum.
 *
 * Antes ela era lida direto de process.env em 16 pontos, sem nenhuma trava, e
 * não constava do .env.example. Quem fosse configurar produção a partir do
 * arquivo de exemplo não tinha como saber que ela existia para conferir se
 * havia ficado ligada.
 *
 * Aqui ela passa a ser ignorada em produção, sempre, independente do valor da
 * variável. É proposital que isso seja uma função e não uma constante de
 * módulo: uma constante congelaria o valor no momento do import, e os testes
 * precisam alternar a flag em runtime para exercer o caminho real.
 */
export function bypassAuthAtivo(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.LOCAL_BYPASS_AUTH === "true";
}

/**
 * Falha alto quando a combinação perigosa aparece. Chamado no escopo de módulo
 * de src/lib/auth.ts, que roda no runtime Node e é importado por todo caminho
 * autenticado. Não é chamado a partir do middleware de propósito: lançar no
 * runtime edge derrubaria a aplicação inteira com um erro difícil de ler.
 *
 * A proteção de fato é o bypassAuthAtivo() acima, que já devolve false em
 * produção. Isto aqui existe para que ninguém opere achando que o bypass está
 * valendo quando não está.
 */
export function assertBypassNaoEstaEmProducao(): void {
  // O BUILD não é execução em produção. `next build` roda com
  // NODE_ENV=production e carrega o .env da máquina, onde a flag está ligada
  // para desenvolvimento: sem esta exceção, `npm run build` falha na coleta de
  // dados das páginas, e falha por uma configuração que não vai para lugar
  // nenhum, já que o .env local não entra na imagem (ver .dockerignore).
  //
  // Descoberto em 25/08/2026, ao rodar o build pela primeira vez, na
  // integração com a versão de infraestrutura do time de engenharia. A
  // proteção que importa continua inteira: NEXT_PHASE só vale enquanto o
  // compilador roda, e no processo que atende requisição ela não existe.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  if (process.env.NODE_ENV === "production" && process.env.LOCAL_BYPASS_AUTH === "true") {
    throw new Error(
      "LOCAL_BYPASS_AUTH está ligada com NODE_ENV=production. Essa flag desliga " +
        "autenticação e autorização e nunca deve ir para produção. Remova a variável " +
        "do ambiente de deploy. Ela é ignorada em produção de qualquer forma, mas a " +
        "presença dela indica configuração errada."
    );
  }
}
