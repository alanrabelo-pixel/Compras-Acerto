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

const SENDER = "compras@acerto.com.br";

function getGmailClient() {
  // Assunção: credenciais de conta de serviço em variável de ambiente (JSON),
  // com domain-wide delegation habilitada para SENDER.
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/gmail.send"],
    subject: SENDER,
  });
  return google.gmail({ version: "v1", auth });
}

function buildRawMessage(to: string, subject: string, html: string) {
  const message = [
    `To: ${to}`,
    `From: Time de Compras | F&NC <${SENDER}>`,
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

export async function sendPurchaseEmail(params: {
  to: string;
  subject: string;
  html: string;
  requestId?: string;
}) {
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
  confirmacaoRecebimento: (nome: string, descricao: string) => ({
    subject: `Confirmação de Recebimento da Solicitação de Compra - ${descricao}`,
    html: `<p>Olá, <b>${nome}</b>!</p><p>Agradecemos pela sua solicitação! Confirmamos o recebimento da Solicitação de Compra e informamos que ela está sendo processada.</p><p>Atenciosamente,<br/>Time de Compras | F&NC</p>`,
  }),
  atualizacaoEtapa: (nome: string, descricao: string, etapa: string) => ({
    subject: `Atualização da Solicitação de Compra - ${descricao}`,
    html: `<p>Olá, <b>${nome}</b>!</p><p>Informamos que a solicitação de compra <b>${descricao}</b> entrou na fase de "${etapa}".</p><p>Atenciosamente,<br/>Time de Compras | F&NC</p>`,
  }),
  reprovado: (nome: string, descricao: string, motivo: string) => ({
    subject: `Reprovada a Solicitação de Compra - ${descricao}`,
    html: `<p>Olá, <b>${nome}</b>!</p><p>Informamos que a solicitação de compra <b>${descricao}</b> foi reprovada. Motivo: ${motivo}</p><p>Atenciosamente,<br/>Time de Compras | F&NC</p>`,
  }),
  aprovado: (nome: string, descricao: string) => ({
    subject: `Aprovada a Solicitação de Compra - ${descricao}`,
    html: `<p>Olá, <b>${nome}</b>!</p><p>Informamos que a solicitação de compra <b>${descricao}</b> foi aprovada no fluxo financeiro e de compras.</p><p>Atenciosamente,<br/>Time de Compras | F&NC</p>`,
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
  alertaRenovacaoContrato: (nome: string, fornecedor: string, dataLimite: string, linkNovaSolicitacao: string) => ({
    subject: `Renovação ou Cancelamento de Contrato - ${fornecedor}`,
    html: `<p>Olá, <b>${nome}</b>!</p><p>Informamos que o contrato do fornecedor <b>${fornecedor}</b> está próximo do fim da vigência, prevista até o dia ${dataLimite}.</p><p>Para dar andamento, acesse: <a href="${linkNovaSolicitacao}">abrir novo processo de compras</a>.</p><p>Atenciosamente,<br/>Time de Compras | F&NC</p>`,
  }),
};
