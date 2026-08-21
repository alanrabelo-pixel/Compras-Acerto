import type { Stage } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PAPEIS_QUE_ATUAM_NA_ETAPA } from "@/lib/acesso";
import { STAGES } from "@/lib/workflow";

/**
 * Quem é avisado quando uma solicitação muda de etapa.
 *
 * Reescrito em 21/08/2026, na revisão das mensagens, que encontrou duas
 * distorções simétricas:
 *
 * DE UM LADO, RUÍDO. O solicitante recebia aviso em TODAS as doze transições,
 * sempre com o mesmo texto genérico e sem pedir nada. Uma compra que percorre
 * o fluxo inteiro gerava doze e-mails iguais, e o efeito de doze avisos que
 * não pedem nada é a pessoa parar de ler o décimo terceiro, que pode ser o que
 * importava.
 *
 * DO OUTRO, SILÊNCIO. Ninguém avisava QUEM PRECISA AGIR. A solicitação entrava
 * em Cotação e nenhum comprador sabia; chegava ao Jurídico e o Jurídico não
 * era avisado; o mesmo em Due Diligence, Medição, Fiscal e Tesouraria. Só o
 * solicitante era notificado, e ele é justamente quem não tem nada a fazer.
 * O trabalho só andava porque alguém abria "Minhas Pendências" por hábito.
 *
 * A regra agora separa os dois papéis: o solicitante ACOMPANHA os marcos, e
 * quem atua é CONVOCADO em toda entrada de etapa.
 */

/**
 * Marcos em que o solicitante é avisado. As demais transições são trabalho
 * interno do time de Compras e não mudam nada para quem pediu.
 *
 * Jurídico entra na lista apesar de não pedir nada dele porque é a etapa mais
 * longa do fluxo (20 a 30 dias úteis de referência): sem o aviso, a compra
 * parece parada por um mês sem explicação.
 *
 * Cancelamento e reprovação NÃO estão aqui: têm textos próprios, disparados
 * pelas rotas que decidem, e que dizem o motivo (ver templates.reprovado).
 */
export const MARCOS_DO_SOLICITANTE: readonly Stage[] = [
  "VALIDACAO_ORCAMENTARIA", // a Triagem aceitou: a compra entrou de fato no fluxo
  "APROVACAO",
  "JURIDICO",
  "PEDIDO_COMPRA",
  "CONCLUIDO",
];

export function solicitanteAcompanha(etapa: Stage): boolean {
  return MARCOS_DO_SOLICITANTE.includes(etapa);
}

export type Convocado = { name: string; email: string };

/**
 * Quem precisa agir na etapa de destino.
 *
 * O papel de cada etapa vem de PAPEIS_QUE_ATUAM_NA_ETAPA, a mesma tabela que
 * governa quem pode LER e ESCREVER naquela etapa. Reaproveitada de propósito:
 * uma segunda lista de "quem avisar" envelheceria em separado, e o sintoma
 * seria alguém deixar de ser avisado de um trabalho que continua podendo
 * fazer.
 *
 * QUANDO JÁ HÁ COMPRADOR DESIGNADO, e a etapa é de comprador, só ele é
 * avisado. Sem isso, toda entrada em Cotação, Mapa de Cotação, Pedido de
 * Compra, Medição e Mapeamento de Contrato mandaria DM para todos os
 * compradores da empresa, sobre uma compra que já tem dono. O leque completo
 * fica para a Triagem, onde ainda não há comprador e alguém precisa pegar.
 *
 * Etapas sem papel na tabela (Solicitação, Aguardando Entrega, Concluído,
 * Cancelado) não convocam ninguém: a primeira é instantânea, a segunda espera
 * o fornecedor, e as duas últimas são fim de linha.
 */
export async function convocadosDaEtapa(
  etapa: Stage,
  buyerId: string | null,
): Promise<Convocado[]> {
  const papeis = PAPEIS_QUE_ATUAM_NA_ETAPA[etapa];
  if (!papeis || papeis.length === 0) return [];

  if (papeis.includes("COMPRADOR") && buyerId) {
    const comprador = await prisma.user.findUnique({
      where: { id: buyerId },
      select: { name: true, email: true, active: true },
    });
    return comprador?.active ? [{ name: comprador.name, email: comprador.email }] : [];
  }

  return prisma.user.findMany({
    where: { active: true, roles: { some: { role: { in: papeis } } } },
    select: { name: true, email: true },
    orderBy: { name: "asc" },
  });
}

/** Texto da convocação, igual no e-mail e no Slack quanto ao conteúdo. */
export function convocacao(params: {
  nome: string;
  codigo: string;
  descricao: string;
  etapa: Stage;
  solicitante: string;
  valor: string;
  link: string;
}): { assunto: string; html: string; slack: string } {
  const rotulo = STAGES[params.etapa].label;
  return {
    assunto: `Ação necessária em ${rotulo}: ${params.codigo} - ${params.descricao}`,
    html:
      `<p>Olá, <b>${params.nome}</b>!</p>` +
      `<p>A solicitação <b>${params.codigo}</b> (${params.descricao}) chegou na etapa de <b>${rotulo}</b> e depende de você para seguir.</p>` +
      `<p>Valor estimado: ${params.valor}<br/>Solicitante: ${params.solicitante}</p>` +
      `<p><a href="${params.link}">Abrir a solicitação</a></p>` +
      `<p>Atenciosamente,<br/>Time de Compras | F&NC</p>`,
    slack:
      `*Ação necessária em ${rotulo}: ${params.codigo}*\n${params.descricao}\n` +
      `Valor estimado: ${params.valor}\nSolicitante: ${params.solicitante}\n` +
      `<${params.link}|Abrir a solicitação>`,
  };
}
