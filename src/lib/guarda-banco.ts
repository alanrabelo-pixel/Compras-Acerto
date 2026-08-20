/**
 * Guarda de banco: impede que rotinas que ESCREVEM no banco rodem contra um
 * Postgres que não seja o de desenvolvimento local.
 *
 * Por que existe: duas rotinas deste repositório gravam sem perguntar nada.
 * O seed (`npm run prisma:seed`) faz upsert de usuários, papéis, centros de
 * custo e linhas de orçamento. A suíte de testes cria registros de verdade e,
 * no cleanup, roda deleteMany por prefixo (ver src/test-helpers/fixtures.ts).
 * As duas leem o mesmo DATABASE_URL do ambiente. Basta um `.env` com a string
 * de conexão de Produção ou de Sandbox aberto na máquina de alguém, ou a
 * variável exportada no shell de um deploy, para que `npm test` escreva e
 * apague dentro do banco errado. Não existe desfazer.
 *
 * O critério é o host da conexão, e é uma lista fechada: só `localhost` e
 * `127.0.0.1`, que é onde vive o Postgres portátil de desenvolvimento (porta
 * 5433). Qualquer outro host para tudo, inclusive host vazio, DATABASE_URL
 * ausente e string que não dá para interpretar. Falha fechada: uma conexão que
 * não se deixa entender não recebe o benefício da dúvida.
 *
 * A saída de emergência existe, mas exige ato consciente: a variável
 * PERMITIR_BANCO_NAO_LOCAL precisa valer exatamente "eu-sei-o-risco". Nem
 * "true", nem "1", nem "sim" liberam, justamente para que ninguém libere sem
 * ler o que está liberando.
 *
 * Nota: NÃO use esta guarda para decidir comportamento de produto (quem manda
 * e-mail, quem manda Slack). Ambiente é assunto de src/lib/ambiente.ts, via
 * APP_ENV. Aqui a pergunta é outra e mais estreita: "este processo pode
 * escrever no banco que está configurado?".
 */

/** Variável que libera a execução contra um banco não local. */
export const VARIAVEL_DE_ESCAPE = "PERMITIR_BANCO_NAO_LOCAL";

/** Valor exato exigido na variável de escape. Qualquer outro não libera. */
export const VALOR_DE_ESCAPE = "eu-sei-o-risco";

/** Únicos hosts aceitos sem escape. */
export const HOSTS_LOCAIS = ["localhost", "127.0.0.1"] as const;

export type AvaliacaoDeBanco = {
  /**
   * "local": host permitido, pode seguir.
   * "liberado_por_escape": host proibido, mas liberado conscientemente.
   * "bloqueado": não pode seguir.
   */
  situacao: "local" | "liberado_por_escape" | "bloqueado";
  /** Host extraído do DATABASE_URL, ou null quando não deu para extrair. */
  host: string | null;
  /** Frase curta explicando o veredito. Entra na mensagem de erro. */
  motivo: string;
};

/**
 * Extrai o host de uma string de conexão do Postgres. Devolve null quando a
 * string está vazia, não é uma URL válida ou não tem host.
 *
 * O host é minúsculo à força: o parser de URL do Node não normaliza o host de
 * esquemas não especiais (`postgresql://` é um deles), então "LOCALHOST"
 * chegaria aqui em maiúsculas e escaparia da lista.
 */
export function hostDoBanco(databaseUrl: string | undefined | null): string | null {
  const bruto = (databaseUrl ?? "").trim();
  if (bruto === "") return null;

  let host: string;
  try {
    host = new URL(bruto).hostname;
  } catch {
    return null;
  }

  const normalizado = host.trim().toLowerCase();
  return normalizado === "" ? null : normalizado;
}

/**
 * Decide se este DATABASE_URL pode ser usado por uma rotina que escreve.
 * Função pura, sem process.env, para poder ser testada valor a valor.
 */
export function avaliarBancoDeDados(
  databaseUrl: string | undefined | null,
  valorDeEscape: string | undefined | null
): AvaliacaoDeBanco {
  const host = hostDoBanco(databaseUrl);
  const escapeAtivo = (valorDeEscape ?? "") === VALOR_DE_ESCAPE;

  if (host !== null && (HOSTS_LOCAIS as readonly string[]).includes(host)) {
    return { situacao: "local", host, motivo: `host "${host}" é local` };
  }

  const motivo =
    host === null
      ? "DATABASE_URL está ausente, vazio ou não é uma string de conexão interpretável"
      : `DATABASE_URL aponta para o host "${host}", que não é local`;

  if (escapeAtivo) {
    return { situacao: "liberado_por_escape", host, motivo };
  }

  return { situacao: "bloqueado", host, motivo };
}

/** Texto do erro que interrompe a execução. */
export function mensagemDeBloqueio(origem: string, avaliacao: AvaliacaoDeBanco): string {
  return [
    `[guarda de banco] ${origem} foi interrompido.`,
    `Motivo: ${avaliacao.motivo}.`,
    "",
    "Esta rotina ESCREVE no banco (o seed faz upsert de usuários e papéis; os",
    "testes criam registros e apagam em massa no cleanup). Rodar contra o banco",
    "de Produção ou de Sandbox contamina dados reais e apaga o que não é seu,",
    "sem desfazer.",
    "",
    `Hosts aceitos: ${HOSTS_LOCAIS.join(", ")} (o Postgres portátil de desenvolvimento, porta 5433).`,
    "Confira o DATABASE_URL do seu .env e do seu shell.",
    "",
    "Se for mesmo necessário rodar contra este banco, faça no próprio comando e",
    `só nele: ${VARIAVEL_DE_ESCAPE}="${VALOR_DE_ESCAPE}"`,
  ].join("\n");
}

/**
 * Interrompe o processo (lançando) se o DATABASE_URL do ambiente não for
 * local. Chamada no topo de prisma/seed.ts e de vitest.config.ts.
 *
 * @param origem nome legível de quem está sendo interrompido, para a mensagem.
 */
export function exigirBancoLocal(origem: string): AvaliacaoDeBanco {
  const avaliacao = avaliarBancoDeDados(process.env.DATABASE_URL, process.env[VARIAVEL_DE_ESCAPE]);

  if (avaliacao.situacao === "bloqueado") {
    throw new Error(mensagemDeBloqueio(origem, avaliacao));
  }

  if (avaliacao.situacao === "liberado_por_escape") {
    console.warn(
      `[guarda de banco] ATENÇÃO: ${origem} vai escrever num banco NÃO LOCAL ` +
        `(${avaliacao.motivo}), liberado por ${VARIAVEL_DE_ESCAPE}.`
    );
  }

  return avaliacao;
}
