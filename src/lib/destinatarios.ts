import { ehProducao } from "@/lib/ambiente";

/**
 * Destinatários fixos de alertas de controle.
 *
 * O endereço da Controladoria estava escrito à mão dentro do cron de
 * escalonamento, e ia ser repetido no alerta de fracionamento. Dois lugares já
 * bastam para divergirem: numa troca de e-mail da área, um seria atualizado e
 * o outro passaria a mandar para o vazio sem ninguém perceber, porque falha de
 * entrega não interrompe o fluxo.
 *
 * Configurável por EMAIL_CONTROLADORIA. O que mudou: o padrão deixou de valer
 * em todo lugar e passou a valer SÓ em produção.
 *
 * Antes, o fallback era a caixa real da Controladoria, e a variável está
 * ausente do .env em uso, ou seja: o fallback é o caminho normal, não a
 * exceção. Qualquer execução de Sandbox que disparasse escalonamento de
 * aprovação ou alerta de fracionamento endereçaria uma área de verdade, com
 * dados de teste. Fora de produção o destino passa a ser um endereço em
 * domínio reservado (.invalid, RFC 2606), que não existe e não pode ser
 * entregue por ninguém.
 *
 * Isso é a segunda camada. A primeira é a trava de ambiente em
 * sendPurchaseEmail e sendSlackDM, que fora de produção não envia para
 * endereço nenhum, real ou não. As duas juntas cobrem o caso de alguém
 * remover a trava sem se lembrar deste fallback.
 */
const CONTROLADORIA_PRODUCAO = "controladoria@acerto.com.br";
const CONTROLADORIA_SEM_ENTREGA = "controladoria@sandbox.invalid";

/**
 * Função e não constante de módulo, pelo mesmo motivo documentado em
 * src/lib/bypass.ts: uma constante congela o valor no import e não dá para
 * exercer os dois ambientes em teste. A constante abaixo continua exportada
 * para os chamadores atuais.
 */
export function destinoControladoria(): string {
  const configurado = process.env.EMAIL_CONTROLADORIA?.trim();
  if (configurado) return configurado;
  return ehProducao() ? CONTROLADORIA_PRODUCAO : CONTROLADORIA_SEM_ENTREGA;
}

export const DESTINO_CONTROLADORIA = destinoControladoria();
