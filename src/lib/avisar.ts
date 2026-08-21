import { sendPurchaseEmail } from "@/lib/integrations/gmail";
import { sendSlackDM } from "@/lib/integrations/slack";
import { logger } from "@/lib/logger";

/**
 * Comunicação geral: SEMPRE pelos dois canais, e-mail e Slack.
 *
 * Decisão do dono do sistema em 21/08/2026, tomada na revisão das mensagens.
 * Até aqui cada ponto do fluxo escolhia um canal por conta própria, e o
 * resultado era arbitrário: o solicitante recebia só e-mail em todo o fluxo, o
 * aprovador só Slack (e só quando já estava atrasado), e o alerta de
 * fracionamento ia pelos dois porque alguém lembrou. Quem lê e-mail e quem lê
 * Slack são pessoas diferentes, e o sistema não tem como saber qual é qual.
 *
 * OS DOIS ENVIOS SÃO INDEPENDENTES. Slack fora do ar não impede o e-mail, e
 * vice-versa. Nenhum dos dois derruba o fluxo: falha vira registro em
 * Notification (o e-mail) ou linha de log (o Slack), e a compra segue. É o
 * mesmo princípio de falha silenciosa e registrada que já valia aqui, agora
 * num lugar só em vez de repetido em cada rota.
 *
 * A trava de ambiente continua dentro de cada integração: fora de produção
 * nada sai por nenhum dos dois canais.
 */
/**
 * O que saiu. Devolvido porque os crons contam falhas de aviso e reportam o
 * número na resposta: sem isto, o contador ficaria sempre em zero e a rota
 * afirmaria "nenhuma falha" mesmo com os dois canais fora do ar. Este projeto
 * já teve exatamente esse defeito duas vezes, com registros dizendo que um
 * aviso saiu quando nada tinha saído.
 *
 * Atenção ao que `true` significa: a chamada ao provedor não lançou. Fora de
 * produção a trava de ambiente bloqueia sem lançar, então aqui também é
 * `true`. É o comportamento certo para o contador (não houve falha), e não
 * prova que alguém recebeu.
 */
export type ResultadoDoAviso = { email: boolean; slack: boolean };

export async function avisar(params: {
  /** E-mail da pessoa. Serve para os dois canais: o Slack resolve por e-mail. */
  para: string;
  assunto: string;
  /** Corpo do e-mail, em HTML. */
  html: string;
  /**
   * Texto do Slack, em mrkdwn. Separado do HTML de propósito: Slack não
   * renderiza HTML, e converter na hora produziria mensagem com tag no meio.
   */
  slack: string;
  requestId?: string;
  /** Aparece no log quando algum dos canais falha. */
  origem: string;
}): Promise<ResultadoDoAviso> {
  const [email, slack] = await Promise.all([
    sendPurchaseEmail({
      to: params.para,
      subject: params.assunto,
      html: params.html,
      requestId: params.requestId,
    })
      .then(() => true)
      .catch((erro) => {
        logger.warn("aviso_email_falhou", { origem: params.origem, destino: params.para, erro });
        return false;
      }),
    sendSlackDM({
      slackUserEmail: params.para,
      text: params.slack,
      requestId: params.requestId,
    })
      .then(() => true)
      .catch((erro) => {
        logger.warn("aviso_slack_falhou", { origem: params.origem, destino: params.para, erro });
        return false;
      }),
  ]);

  return { email, slack };
}

/** Vários destinatários, o mesmo aviso. Um erro em um não impede os outros. */
export async function avisarVarios(
  destinos: string[],
  monta: (para: string) => Parameters<typeof avisar>[0],
): Promise<void> {
  await Promise.all(destinos.map((para) => avisar(monta(para))));
}
