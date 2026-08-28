import { logger } from "@/lib/logger";
import { ambienteAtual, ambienteFoiDeclarado } from "@/lib/ambiente";
// Uma definição só de "banco local" no repositório inteiro. Este arquivo tinha
// a sua, /@(localhost|127\.0\.0\.1)[:/]/, que exigia arroba e portanto exigia
// credenciais na string: `postgresql://localhost:5433/acerto` era local para a
// guarda e remoto aqui. Nessa discordância cabia um buraco inteiro, porque a
// mesma URL levava as duas barreiras a conclusões opostas sobre o mesmo banco.
// Ver src/lib/guarda-banco.ts, inclusive sobre o que "local" não cobre (túnel).
import { bancoEhLocal } from "@/lib/guarda-banco";

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

/**
 * Sem estas, o sistema não pode operar com segurança em produção.
 *
 * O CRITÉRIO É AUTENTICAÇÃO, não conveniência. Cada uma aqui é o que separa um
 * sistema com controle de acesso de um sem. Faltando qualquer uma, o boot para.
 *
 * APP_URL saiu desta lista em 25/08/2026, por decisão do dono do sistema: ela
 * não guarda a porta, só os links dos e-mails saem quebrados sem ela. Derrubar
 * produção inteira por causa dela era desproporcional, e na prática foi o que
 * impediu a primeira implantação. Continua avisada alto em
 * RECOMENDADAS_EM_PRODUCAO, com a consequência escrita.
 */
const OBRIGATORIAS_EM_PRODUCAO = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
] as const;

/** Sem estas, alguma funcionalidade para de funcionar, mas o sistema opera. */
const RECOMENDADAS_EM_PRODUCAO = [
  "APP_URL",
  // Chave única da empresa para os Assistentes de IA (ver
  // src/lib/integrations/ai.ts), desde 27/08/2026: antes cada pessoa
  // configurava a própria chave, decisão do dono do sistema foi centralizar.
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "CRON_SECRET",
  "ERP_API_KEY",
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  // AWS_S3_BUCKET substituiu BLOB_READ_WRITE_TOKEN em 25/08/2026, junto com a
  // troca do Vercel Blob pelo S3 (ver src/lib/storage.ts). A lista continuava
  // avisando sobre a variável morta e calada sobre a viva, o que é pior que não
  // avisar: quem configurasse produção pela mensagem preencheria o token do
  // Blob, que hoje não é lido em lugar nenhum, e seguiria sem bucket.
  "AWS_S3_BUCKET",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
] as const;

/** O que cada variável recomendada quebra quando falta. */
const CONSEQUENCIA: Record<string, string> = {
  APP_URL: "os links dos e-mails saem como \"undefined/solicitacoes/...\" e ninguém percebe até alguém clicar",
  ANTHROPIC_API_KEY: "o assistente de IA (Claude) fica indisponível na Nova Solicitação e nos painéis de etapa; o resto do sistema opera normalmente",
  GEMINI_API_KEY: "o assistente de IA (Gemini) fica indisponível na Nova Solicitação e nos painéis de etapa; o resto do sistema opera normalmente",
  CRON_SECRET: "os crons de escalonamento, de alerta de contrato e de resumo executivo mensal recusam toda chamada",
  ERP_API_KEY: "a API de integração com o ERP recusa toda chamada",
  SLACK_BOT_TOKEN: "nenhuma mensagem de Slack é enviada",
  SLACK_SIGNING_SECRET: "o webhook do Slack recusa todos os eventos recebidos",
  AWS_S3_BUCKET: "anexos e fotos de perfil vão para o disco do pod, que é efêmero, e somem no próximo deploy",
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "nenhum e-mail é enviado",
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "nenhum e-mail é enviado",
};

/**
 * Marca obrigatória no NOME do banco do Sandbox.
 *
 * Existe porque a checagem que importa não é verificável de outro jeito. Um
 * agente adversarial demonstrou o buraco: a validação original só recusava
 * "produção apontando para banco local", e a combinação inversa, Sandbox
 * apontando para o banco de PRODUÇÃO, subia em silêncio. É justamente a que
 * acontece, porque provisionar um ambiente copiando as variáveis do outro é o
 * caminho de menor esforço.
 *
 * E com o banco compartilhado o Sandbox nem precisa de credencial de envio: a
 * solicitação de teste nasce na base de produção, e o cron da PRODUÇÃO, esse
 * com a trava liberada, manda o Slack real para o aprovador real. A trava de
 * envio não protege contra isso, porque quem envia é o outro processo.
 *
 * Nenhum código consegue olhar uma URL e saber se aquilo é o banco de
 * produção. O que dá para exigir é uma convenção de nome, e é o runbook que a
 * estabelece: o banco do Sandbox tem "sandbox" ou "sbx" no nome. Convenção
 * sozinha não vale nada, mas convenção conferida no boot vale.
 */
const MARCA_DE_SANDBOX = /(sandbox|sbx)/i;

function nomeDoBanco(url: string): string {
  // Pega o caminho depois do último "/", sem query string. Falha silenciosa
  // devolvendo vazio: a checagem que usa isso trata vazio como "não sei", e
  // não como "está tudo certo".
  const semQuery = url.split("?")[0];
  const partes = semQuery.split("/");
  return partes.length > 3 ? partes[partes.length - 1] : "";
}

export function validarAmbiente(): void {
  // COMPILAR NÃO É OPERAR. `next build` roda com NODE_ENV=production e importa
  // cada rota para coletar dados de página, então esta função rodava no meio
  // do build, num ambiente que por definição não tem segredo de produção
  // nenhum: o build acontece no runner de CI, e as variáveis só existem no
  // cluster, na hora de subir o pod.
  //
  // Sem esta saída, `npm run build` falha com "Variáveis obrigatórias ausentes
  // em produção: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET" e o `docker build` da
  // Golden Pipeline nunca conclui. Encontrado em 25/08/2026, na integração com
  // a versão de infraestrutura do time de engenharia: esta validação nasceu em
  // 19/08, DEPOIS de eles terem partido daqui, então o pipeline deles nunca
  // tinha topado com ela.
  //
  // A proteção continua inteira onde importa. NEXT_PHASE só existe enquanto o
  // compilador roda; o processo que atende requisição não a define, e ali a
  // validação roda igual, no import de @/lib/auth.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const producao = process.env.NODE_ENV === "production";

  // DATABASE_URL vale em qualquer ambiente: sem ela nada funciona.
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não está definida. O sistema não tem como acessar o banco de dados.");
  }

  // Coerência entre o que o ambiente DIZ que é e para onde ele APONTA.
  //
  // Roda em qualquer NODE_ENV de propósito: o Sandbox compilado como produção
  // é o caso normal, não a exceção.
  const ambiente = ambienteAtual();
  const declarado = ambienteFoiDeclarado();
  const url = process.env.DATABASE_URL;
  // Um ambiente que se declara produção e aponta para um Postgres na própria
  // máquina é erro de configuração, não escolha.
  const bancoLocal = bancoEhLocal(url);
  const banco = nomeDoBanco(url);
  const bancoParecSandbox = MARCA_DE_SANDBOX.test(banco);

  if (ambiente === "producao" && bancoLocal) {
    throw new Error(
      "APP_ENV=producao com DATABASE_URL apontando para um banco local. " +
        "Ou este ambiente não é produção e a variável está errada, ou é produção " +
        "e está ligada ao banco errado. O boot foi interrompido nos dois casos."
    );
  }

  if (ambiente === "producao" && bancoParecSandbox) {
    throw new Error(
      `APP_ENV=producao com DATABASE_URL apontando para o banco "${banco}", cujo ` +
        "nome tem marca de Sandbox. Produção gravando na base de teste apaga o " +
        "histórico de compras de verdade sem ninguém perceber na hora."
    );
  }

  // O caso que mais importa, e o que estava faltando: Sandbox ligado a um banco
  // remoto que não se identifica como Sandbox. Não dá para provar que aquilo é
  // a produção, então o critério é o inverso: para gravar em banco remoto, o
  // Sandbox tem que estar num banco que se declara Sandbox pelo nome. Banco
  // local segue liberado, que é o desenvolvimento de todo dia.
  // SÓ DERRUBA QUEM SE DECLAROU SANDBOX. Um ambiente que não define APP_ENV não
  // está afirmando ser Sandbox: está calado. Tratar silêncio como declaração
  // custou caro em 25/08/2026, porque o overlay do Kubernetes do time de
  // engenharia foi escrito antes desta variável existir, e a produção de
  // verdade, remota e sem marca de sandbox no nome, caía exatamente aqui.
  //
  // A proteção que importa continua inteira: o caso perigoso é alguém provisionar
  // um Sandbox copiando as variáveis da produção, e aí APP_ENV=sandbox está lá,
  // escrito, e este erro dispara. O caso omisso vira aviso alto logo abaixo.
  if (ambiente === "sandbox" && declarado && !bancoLocal && !bancoParecSandbox) {
    throw new Error(
      `APP_ENV=sandbox com DATABASE_URL apontando para o banco remoto "${banco}", ` +
        "que não tem marca de Sandbox no nome. Se este banco for o de produção, o " +
        "Sandbox grava solicitações reais e o cron da Produção manda as mensagens " +
        "delas para pessoas de verdade, mesmo com a trava de envio ligada aqui. " +
        "Renomeie o banco do Sandbox incluindo \"sandbox\" ou \"sbx\", ou aponte " +
        "para o banco certo. Ver docs/runbook-ambientes.md."
    );
  }

  // O mesmo desenho, sem declaração: avisa alto e deixa subir. Não dá para
  // saber se isto é a produção que esqueceu de se declarar ou um Sandbox que
  // esqueceu, e derrubar o boot escolhia a segunda hipótese sempre. O aviso
  // nomeia a consequência real de continuar sem declarar: a trava de envio
  // trata tudo como Sandbox, então nenhum e-mail e nenhum Slack sai.
  if (ambiente === "sandbox" && !declarado && !bancoLocal && !bancoParecSandbox) {
    logger.warn("ambiente_nao_declarado_com_banco_remoto", {
      banco,
      efeito:
        "sem APP_ENV, este processo se comporta como Sandbox: não envia e-mail nem Slack " +
        "e mostra a faixa de Sandbox na tela, mesmo gravando neste banco remoto.",
      acao: "Se este É o ambiente de produção, defina APP_ENV=producao. Se é o Sandbox, " +
        "aponte para um banco com \"sandbox\" ou \"sbx\" no nome. Ver docs/runbook-ambientes.md.",
    });
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

  // Só a partir daqui: NODE_ENV é produção. Se APP_ENV não disser que este é o
  // ambiente de produção, o mais provável é que seja o Sandbox rodando com
  // paridade real, que é o desejado. O que não pode passar em silêncio é o
  // caso inverso: produção de verdade sem se declarar, porque aí a trava de
  // envio de src/lib/integrations trata tudo como sandbox e o sistema fica mudo
  // sem ninguém entender por quê.
  if (ambiente !== "producao") {
    logger.warn("ambiente_nao_declarado_como_producao", {
      appEnv: process.env.APP_ENV ?? "(ausente)",
      efeito:
        "e-mail e Slack não serão enviados, e a interface mostra a faixa de Sandbox. " +
        "Se este É o ambiente de produção, defina APP_ENV=producao.",
    });
  }
}
