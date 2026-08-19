/**
 * Destinatários fixos de alertas de controle.
 *
 * O endereço da Controladoria estava escrito à mão dentro do cron de
 * escalonamento, e ia ser repetido no alerta de fracionamento. Dois lugares já
 * bastam para divergirem: numa troca de e-mail da área, um seria atualizado e
 * o outro passaria a mandar para o vazio sem ninguém perceber, porque falha de
 * entrega não interrompe o fluxo.
 *
 * Configurável por variável de ambiente, com o valor atual como padrão para
 * não exigir configuração nova em quem já roda o sistema.
 */
export const DESTINO_CONTROLADORIA =
  process.env.EMAIL_CONTROLADORIA ?? "controladoria@acerto.com.br";
