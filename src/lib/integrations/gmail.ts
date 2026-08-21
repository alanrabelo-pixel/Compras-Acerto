/**
 * Integração de e-mail via Google Workspace (Gmail API).
 *
 * Assunção não verificada: recomendamos usar uma conta de serviço do Workspace
 * (domain-wide delegation) autenticada como compras@acerto.com.br, em vez de
 * SMTP simples, para manter as mensagens dentro do domínio auditável do Google
 * Admin. Confirmar com Rafael Martins (SI e Privacidade) se essa delegação já
 * existe ou precisa ser criada no Admin Console.
 *
 * Todas as mensagens definidas no fluxo de referência (confirmação de
 * recebimento, atualização de etapa, aprovação/reprovação, etc.) devem ser
 * chamadas a partir daqui para manter um único ponto de auditoria: cada envio
 * grava um registro em Notification (ver prisma/schema.prisma).
 */

import { google } from "googleapis";
import { prisma } from "../db";
import { ehProducao } from "../ambiente";
import { logger } from "../logger";

/**
 * Remetente das mensagens.
 *
 * Era uma constante fixa no código. Com dois ambientes na Vercel isso vira um
 * problema: qualquer deploy que conseguisse autenticar mandaria e-mail
 * ASSINADO como a caixa real de Compras, e quem recebesse não teria como
 * distinguir um teste de Sandbox de uma comunicação oficial.
 *
 * Agora vem de GMAIL_SENDER. O padrão histórico só vale em produção, de
 * propósito: fora dela, sem a variável declarada, o valor é um endereço em
 * domínio reservado (.invalid, RFC 2606) que não existe e não pode ser
 * entregue por ninguém. Isso é rede de segurança, não a proteção principal: a
 * proteção é a trava de sendPurchaseEmail, que não envia fora de produção.
 */
const SENDER_PRODUCAO = "compras@acerto.com.br";
const SENDER_SEM_ENTREGA = "nao-enviar@sandbox.invalid";

export function remetente(): string {
  const configurado = process.env.GMAIL_SENDER?.trim();
  if (configurado) return configurado;
  return ehProducao() ? SENDER_PRODUCAO : SENDER_SEM_ENTREGA;
}

function getGmailClient() {
  // Assunção: credenciais de conta de serviço em variável de ambiente (JSON),
  // com domain-wide delegation habilitada para o remetente.
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/gmail.send"],
    subject: remetente(),
  });
  return google.gmail({ version: "v1", auth });
}

function buildRawMessage(to: string, subject: string, html: string) {
  const message = [
    `To: ${to}`,
    `From: Time de Compras | F&NC <${remetente()}>`,
    `Subject: ${subject}`,
    "Content-Type: text/html; charset=utf-8",
    "",
    html,
  ].join("\n");

  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Marcador gravado em Notification.subject quando a trava barra o envio.
 *
 * Não existe status próprio para "bloqueado": a CHECK do banco
 * (Notification_status_valido) só aceita ENVIADO e FALHA, e inventar um
 * terceiro valor exigiria migration. Entre os dois, FALHA é o único honesto:
 * nada saiu. ENVIADO seria pior que não registrar, porque afirmaria uma
 * entrega que não houve, que é exatamente o defeito que o alerta de
 * fracionamento tinha antes. O motivo fica no subject e no log.
 */
const MOTIVO_BLOQUEIO = "BLOQUEADO_FORA_DE_PRODUCAO";

/** Recorta o corpo para o log: o HTML inteiro polui a linha sem acrescentar nada. */
function previaDoCorpo(html: string, limite = 280): string {
  const texto = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return texto.length > limite ? `${texto.slice(0, limite)}...` : texto;
}

/**
 * Registra um envio que a trava barrou. NUNCA lança, nem quando o próprio
 * registro falha: sendPurchaseEmail é chamada sem .catch em várias rotas
 * (ex: src/app/api/tickets/route.ts), e uma exceção aqui derrubaria no
 * Sandbox um fluxo que funciona em produção.
 */
async function registrarEnvioBloqueado(params: {
  to: string;
  subject: string;
  html: string;
  requestId?: string;
}) {
  logger.warn("email_bloqueado_fora_de_producao", {
    motivo: MOTIVO_BLOQUEIO,
    destinatario: params.to,
    remetente: remetente(),
    assunto: params.subject,
    requestId: params.requestId,
    previaDoCorpo: previaDoCorpo(params.html),
  });

  try {
    await prisma.notification.create({
      data: {
        requestId: params.requestId,
        channel: "EMAIL",
        recipient: params.to,
        subject: `[${MOTIVO_BLOQUEIO}] ${params.subject}`,
        status: "FALHA",
      },
    });
  } catch (err) {
    logger.error("falha_ao_registrar_email_bloqueado", { destinatario: params.to, erro: err as Error });
  }
}

export async function sendPurchaseEmail(params: {
  to: string;
  subject: string;
  html: string;
  requestId?: string;
}) {
  // Trava de ambiente. Fora de produção não sai e-mail para lugar nenhum:
  // nem para o destinatário real, nem para um endereço alternativo. Falha
  // fechada, antes de qualquer chamada ao Gmail, e sem lançar.
  //
  // A checagem é de APP_ENV (src/lib/ambiente.ts), não de credencial e não de
  // NODE_ENV. Credencial presente não é permissão para enviar: o Sandbox pode
  // acabar com uma cópia legítima das credenciais do Workspace, e um Sandbox
  // rodando `next start` é NODE_ENV=production. Ambiente que não se declarou
  // cai em sandbox, que é o lado que não manda nada.
  if (!ehProducao()) {
    await registrarEnvioBloqueado(params);
    return;
  }

  try {
    const gmail = getGmailClient();
    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: buildRawMessage(params.to, params.subject, params.html) },
    });
    await prisma.notification.create({
      data: {
        requestId: params.requestId,
        channel: "EMAIL",
        recipient: params.to,
        subject: params.subject,
        status: "ENVIADO",
      },
    });
  } catch (err) {
    await prisma.notification.create({
      data: {
        requestId: params.requestId,
        channel: "EMAIL",
        recipient: params.to,
        subject: params.subject,
        status: "FALHA",
      },
    });
    // Falha de e-mail não deve bloquear o fluxo de compras (mesmo princípio já
    // aplicado ao Slack nas rotas): a falha fica registrada em Notification.
    console.error("Falha ao enviar e-mail:", err);
  }
}

// Templates de e-mail do fluxo original (um por evento-chave). Manter o texto
// alinhado à Política de Compras vigente ao editar.
export const templates = {
  /*
   * OS QUATRO AVISOS AO SOLICITANTE, revistos em 21/08/2026.
   *
   * Todos ganharam o CÓDIGO e o LINK. Antes identificavam a compra só pela
   * descrição curta, e não diziam para onde ir: a pessoa recebia "sua
   * solicitação avançou" e tinha de encontrá-la sozinha, sendo que o código
   * (PC-AAAA-NNNN) é a chave usada em todo o resto do sistema, na busca, no
   * quadro e nas conversas. Duas compras com descrição parecida eram
   * indistinguíveis na caixa de entrada.
   *
   * `reprovado` ganhou a ETAPA. Ele serve três situações diferentes (aprovação
   * final, Due Diligence e exceção orçamentária) e o assunto era idêntico nas
   * três, sem dizer onde a compra parou, que é justamente o que muda o que
   * fazer a seguir.
   */
  confirmacaoRecebimento: (nome: string, codigo: string, descricao: string, link: string) => ({
    subject: `Solicitação ${codigo} recebida - ${descricao}`,
    html:
      `<p>Olá, <b>${nome}</b>!</p>` +
      `<p>Recebemos a sua Solicitação de Compra <b>${codigo}</b> (${descricao}).</p>` +
      `<p>Ela seguiu para a <b>Homologação e Triagem</b>, com o time de Compras | F&NC, que confere as informações antes de dar andamento. Você é avisado a cada passo.</p>` +
      `<p><a href="${link}">Acompanhar a solicitação</a></p>` +
      `<p>Atenciosamente,<br/>Time de Compras | F&NC</p>`,
  }),
  atualizacaoEtapa: (nome: string, codigo: string, descricao: string, etapa: string, link: string) => ({
    subject: `${codigo} avançou para ${etapa} - ${descricao}`,
    html:
      `<p>Olá, <b>${nome}</b>!</p>` +
      `<p>A solicitação <b>${codigo}</b> (${descricao}) entrou na fase de "<b>${etapa}</b>".</p>` +
      `<p>Nada é necessário da sua parte neste momento.</p>` +
      `<p><a href="${link}">Acompanhar a solicitação</a></p>` +
      `<p>Atenciosamente,<br/>Time de Compras | F&NC</p>`,
  }),
  /**
   * Devolvida na Triagem: separado de `atualizacaoEtapa` de propósito.
   *
   * Usava o mesmo texto genérico de um avanço qualquer, dizendo "entrou na
   * fase de Triagem: informações pendentes", sem o motivo e sem pedir nada.
   * Era o único caso em que a pessoa PRECISA agir, chegando com a cara dos
   * outros onze avisos em que ela não precisa fazer nada.
   */
  solicitacaoDevolvida: (nome: string, codigo: string, descricao: string, motivo: string, link: string) => ({
    subject: `Ação necessária: ${codigo} foi devolvida - ${descricao}`,
    html:
      `<p>Olá, <b>${nome}</b>!</p>` +
      `<p>A solicitação <b>${codigo}</b> (${descricao}) foi devolvida na Triagem porque faltam informações.</p>` +
      `<p>O que o time de Compras precisa: ${motivo}</p>` +
      `<p>Complete os dados e a solicitação volta a andar. Enquanto isso, ela fica parada.</p>` +
      `<p><a href="${link}">Abrir a solicitação para completar</a></p>` +
      `<p>Atenciosamente,<br/>Time de Compras | F&NC</p>`,
  }),
  reprovado: (nome: string, codigo: string, descricao: string, etapa: string, motivo: string, link: string) => ({
    subject: `Reprovada em ${etapa}: ${codigo} - ${descricao}`,
    html:
      `<p>Olá, <b>${nome}</b>!</p>` +
      `<p>A solicitação <b>${codigo}</b> (${descricao}) foi reprovada na etapa de <b>${etapa}</b>.</p>` +
      `<p>Motivo: ${motivo}</p>` +
      `<p>A solicitação foi encerrada. Se a necessidade continuar, o caminho é abrir uma nova tratando o motivo acima, ou falar com quem decidiu.</p>` +
      `<p><a href="${link}">Ver a solicitação</a></p>` +
      `<p>Atenciosamente,<br/>Time de Compras | F&NC</p>`,
  }),
  aprovado: (nome: string, codigo: string, descricao: string, proximaEtapa: string, link: string) => ({
    subject: `Aprovada: ${codigo} - ${descricao}`,
    html:
      `<p>Olá, <b>${nome}</b>!</p>` +
      `<p>A solicitação <b>${codigo}</b> (${descricao}) foi aprovada no fluxo financeiro e de compras.</p>` +
      `<p>Próxima etapa: <b>${proximaEtapa}</b>.</p>` +
      `<p><a href="${link}">Acompanhar a solicitação</a></p>` +
      `<p>Atenciosamente,<br/>Time de Compras | F&NC</p>`,
  }),
  pedidoCompraGerado: (nome: string, descricao: string, codigoPedido: string, pdfUrl: string) => ({
    subject: `Pedido de Compra gerado - ${descricao}`,
    html: `<p>Olá, <b>${nome}</b>!</p><p>O Pedido de Compra <b>${codigoPedido}</b> foi gerado para a solicitação <b>${descricao}</b>.</p><p><a href="${pdfUrl}">Baixar o PDF do Pedido de Compra</a></p><p>Atenciosamente,<br/>Time de Compras | F&NC</p>`,
  }),
  chamadoAberto: (nome: string, categoriaLabel: string, codigo: string, linkChamado: string) => ({
    subject: `Chamado ${codigo} recebido: ${categoriaLabel}`,
    html: `<p>Olá, <b>${nome}</b>!</p><p>Recebemos seu chamado de <b>${categoriaLabel}</b> (${codigo}).</p><p>Acompanhe as respostas e o andamento por aqui: <a href="${linkChamado}">${linkChamado}</a></p><p>Atenciosamente,<br/>Acerto</p>`,
  }),
  chamadoNovaMensagem: (nome: string, categoriaLabel: string, codigo: string, linkChamado: string) => ({
    subject: `Nova mensagem no chamado ${codigo}: ${categoriaLabel}`,
    html: `<p>Olá, <b>${nome}</b>!</p><p>Há uma nova mensagem no seu chamado <b>${codigo}</b> (${categoriaLabel}).</p><p>Veja e responda por aqui: <a href="${linkChamado}">${linkChamado}</a></p><p>Atenciosamente,<br/>Acerto</p>`,
  }),
  /**
   * Risco de fracionamento: a soma das compras do mesmo fornecedor nos últimos
   * 12 meses ultrapassa uma alçada que o valor isolado não atingiria.
   *
   * Antes este alerta não existia: a Triagem gravava um registro de
   * notificação com status ENVIADO e não mandava nada, então a Controladoria
   * nunca ficava sabendo. O controle detectava e morria ali.
   */
  riscoFracionamento: (
    codigo: string,
    descricao: string,
    fornecedor: string,
    nivelIsolado: number,
    nivelSomado: number,
    link: string
  ) => ({
    subject: `Risco de fracionamento: ${codigo}`,
    html: `<p>A solicitação <b>${codigo}</b> (${descricao}) foi sinalizada com risco de fracionamento na Triagem.</p><p>Sozinha, ela cai na alçada de <b>Nível ${nivelIsolado}</b>. Somada às compras do fornecedor <b>${fornecedor}</b> nos últimos 12 meses, o total alcança a alçada de <b>Nível ${nivelSomado}</b>.</p><p>Isso não bloqueia a solicitação: ela segue o fluxo normalmente. O alerta existe para a Controladoria avaliar se as compras deveriam ter sido tratadas como uma só.</p><p><a href="${link}">Abrir a solicitação</a></p><p>Atenciosamente,<br/>Time de Compras | F&NC</p>`,
  }),

  /**
   * Aprovação atribuída: avisa quem tem de decidir, no momento em que passa a
   * ter de decidir.
   *
   * Criado em 21/08/2026, na revisão das mensagens. Era a maior lacuna do
   * fluxo: o aprovador era designado e NADA saía. Ele descobria abrindo
   * "Minhas Pendências" por conta própria, ou pelo cron de escalonamento, que
   * só dispara depois de a aprovação já estar atrasada. O sistema avisava que
   * alguém estava atrasado antes de avisar que existia trabalho.
   *
   * Traz o valor porque é o que decide a urgência de quem lê, e quantas
   * assinaturas a faixa exige porque muda o que acontece depois do clique:
   * com duas, a compra ainda espera a outra pessoa.
   */
  aprovacaoAtribuida: (
    nome: string,
    codigo: string,
    descricao: string,
    valor: string,
    faixa: string,
    assinaturas: number,
    solicitante: string,
    link: string
  ) => ({
    subject: `Aprovação pendente: ${codigo} - ${descricao}`,
    html:
      `<p>Olá, <b>${nome}</b>!</p>` +
      `<p>A solicitação <b>${codigo}</b> (${descricao}) está aguardando a sua aprovação.</p>` +
      `<p>Valor: <b>${valor}</b><br/>Alçada: ${faixa}<br/>Solicitante: ${solicitante}</p>` +
      (assinaturas > 1
        ? `<p>Esta faixa exige <b>${assinaturas} aprovadores distintos</b>: a compra só avança depois que todos decidirem.</p>`
        : "") +
      `<p><a href="${link}">Abrir a solicitação para decidir</a></p>` +
      `<p>Atenciosamente,<br/>Time de Compras | F&NC</p>`,
  }),

  /**
   * Exceção orçamentária aberta: avisa quem tem a alçada de decidi-la.
   * Mesma lacuna da aprovação final, no outro ponto que trava o fluxo.
   */
  excecaoOrcamentariaAtribuida: (
    nome: string,
    codigo: string,
    descricao: string,
    valor: string,
    solicitante: string,
    motivo: string | null,
    link: string
  ) => ({
    subject: `Exceção orçamentária pendente: ${codigo} - ${descricao}`,
    html:
      `<p>Olá, <b>${nome}</b>!</p>` +
      `<p>A solicitação <b>${codigo}</b> (${descricao}) foi aberta sem linha de orçamento e depende da sua decisão sobre a exceção orçamentária.</p>` +
      `<p>Valor: <b>${valor}</b><br/>Solicitante: ${solicitante}</p>` +
      (motivo ? `<p>Motivo informado por quem abriu: ${motivo}</p>` : "") +
      `<p><a href="${link}">Abrir a solicitação para decidir</a></p>` +
      `<p>Atenciosamente,<br/>Time de Compras | F&NC</p>`,
  }),

  /** Exceção aprovada: fecha a assimetria em que só a reprovação avisava. */
  excecaoOrcamentariaAprovada: (nome: string, codigo: string, descricao: string, link: string) => ({
    subject: `Exceção orçamentária aprovada: ${codigo} - ${descricao}`,
    html:
      `<p>Olá, <b>${nome}</b>!</p>` +
      `<p>A exceção orçamentária da solicitação <b>${codigo}</b> (${descricao}) foi aprovada, e a compra seguiu no fluxo mesmo sem linha de orçamento prevista.</p>` +
      `<p><a href="${link}">Acompanhar a solicitação</a></p>` +
      `<p>Atenciosamente,<br/>Time de Compras | F&NC</p>`,
  }),

  alertaRenovacaoContrato: (nome: string, fornecedor: string, dataLimite: string, linkNovaSolicitacao: string) => ({
    subject: `Renovação ou Cancelamento de Contrato - ${fornecedor}`,
    html: `<p>Olá, <b>${nome}</b>!</p><p>Informamos que o contrato do fornecedor <b>${fornecedor}</b> está próximo do fim da vigência, prevista até o dia ${dataLimite}.</p><p>Para dar andamento, acesse: <a href="${linkNovaSolicitacao}">abrir novo processo de compras</a>.</p><p>Atenciosamente,<br/>Time de Compras | F&NC</p>`,
  }),
};
