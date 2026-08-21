import { Prisma, type Stage } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isValidTransition, STAGES } from "@/lib/workflow";
import { templates } from "@/lib/integrations/gmail";
import { avisar } from "@/lib/avisar";
import { solicitanteAcompanha, convocadosDaEtapa, convocacao } from "@/lib/avisos-de-etapa";
import { formatCurrency } from "@/lib/format";
import { logger } from "@/lib/logger";
import { USUARIO_PUBLICO } from "@/lib/usuario";

/**
 * Avanço de etapa da Solicitação de Compra, atômico e validado.
 *
 * O padrão que existia nas 16 rotas de etapa era este, em três passos soltos:
 *
 *   const r = await prisma.purchaseRequest.findUnique(...)   // 1. lê
 *   if (r.currentStage !== "X") return 409                   // 2. checa
 *   await prisma.purchaseRequest.update(...)                 // 3. escreve
 *   await prisma.stageEvent.create(...)                      // 4. registra
 *
 * Três problemas nisso:
 *
 * 1. JANELA ENTRE CHECAR E ESCREVER. Duas pessoas agindo na mesma solicitação
 *    passam as duas pelo guard do passo 2, escrevem as duas, e o histórico
 *    ganha dois eventos para a mesma transição. A notificação também sai
 *    duplicada.
 * 2. SEM TRANSAÇÃO. Existia UM $transaction em toda a base. Se o passo 4
 *    falhasse, a etapa já teria avançado e o histórico ficaria com buraco. Num
 *    sistema cuja entrega é o rastro de quem decidiu o quê, a trilha de
 *    auditoria ser sempre a última escrita é a ordem inversa da desejável.
 * 3. O GRAFO DE TRANSIÇÕES ERA DECORATIVO. isValidTransition existe em
 *    workflow.ts mas só era chamado nos testes. Cada rota fazia sua própria
 *    checagem isolada, e nada garantia em runtime que o fluxo fosse respeitado.
 *
 * Aqui o guard vira condição do próprio UPDATE (o banco decide, não a
 * aplicação), a escrita e o registro ficam na mesma transação, e o grafo é
 * consultado de verdade.
 */

export type ResultadoDeAvanco =
  | { ok: true; solicitacao: SolicitacaoComSolicitante }
  | { ok: false; status: 409 | 422; erro: string };

type SolicitacaoComSolicitante = Prisma.PurchaseRequestGetPayload<{
  include: { requester: { select: typeof USUARIO_PUBLICO } };
}>;

export async function avancarEtapa(params: {
  requestId: string;
  de: Stage;
  para: Stage;
  actorId?: string | null;
  comentario?: string | null;
  /**
   * Outros campos da solicitação a gravar na MESMA transação (ex: status,
   * cancelReason, os campos calculados na Triagem).
   *
   * Unchecked, e não a variante normal, porque as rotas precisam gravar chave
   * estrangeira crua (buyerId na Triagem). A variante checada só aceita a
   * relação aninhada, que updateMany não suporta.
   */
  dadosExtras?: Prisma.PurchaseRequestUncheckedUpdateManyInput;
}): Promise<ResultadoDeAvanco> {
  const { requestId, de, para, actorId, comentario, dadosExtras } = params;

  if (!isValidTransition(de, para)) {
    // Erro de programação, não de uso: significa que uma rota está tentando uma
    // transição que o grafo não prevê. Melhor falhar alto do que gravar.
    logger.error("transicao_de_etapa_invalida", { requestId, de, para });
    return {
      ok: false,
      status: 422,
      erro: `Transição de etapa inválida: ${STAGES[de].label} não leva a ${STAGES[para].label}.`,
    };
  }

  try {
    const solicitacao = await prisma.$transaction(async (tx) => {
      // O guard vira condição do UPDATE. Se outra pessoa já moveu a
      // solicitação, count é 0 e ninguém escreve por cima.
      const alteradas = await tx.purchaseRequest.updateMany({
        where: { id: requestId, currentStage: de },
        data: { currentStage: para, ...dadosExtras },
      });

      if (alteradas.count === 0) {
        throw new ConflitoDeEtapa();
      }

      await tx.stageEvent.create({
        data: { requestId, fromStage: de, toStage: para, actorId: actorId ?? null, comment: comentario ?? null },
      });

      // select em vez do include cru: este objeto é devolvido no corpo da
      // resposta por 14 rotas de etapa, e `requester: true` estava mandando o
      // User inteiro junto, com as duas chaves de IA da pessoa dentro.
      return tx.purchaseRequest.findUniqueOrThrow({
        where: { id: requestId },
        include: { requester: { select: USUARIO_PUBLICO } },
      });
    });

    return { ok: true, solicitacao };
  } catch (erro) {
    if (erro instanceof ConflitoDeEtapa) {
      return {
        ok: false,
        status: 409,
        erro: `Esta solicitação não está mais na etapa de ${STAGES[de].label}. Recarregue a página para ver o estado atual.`,
      };
    }
    throw erro;
  }
}

/**
 * Sentinela: força o rollback da transação sem virar erro 500.
 *
 * Exportada porque a rota de override administrativo precisa do mesmo padrão
 * de guard atômico, mas não pode usar avancarEtapa: ela existe justamente para
 * contornar o grafo de transições que o helper impõe.
 */
export class ConflitoDeEtapa extends Error {}

/**
 * Aviso padrão de mudança de etapa ao solicitante.
 *
 * Fica FORA da transação de propósito: chamada de rede não pode segurar
 * conexão de banco aberta, e uma falha de e-mail não deve desfazer um avanço de
 * etapa já decidido. A falha é registrada em vez de engolida, que era o padrão
 * anterior nas rotas.
 */
export async function notificarAvancoDeEtapa(
  solicitacao: SolicitacaoComSolicitante,
  etapaDestino: Stage
): Promise<void> {
  const link = `${process.env.APP_URL}/solicitacoes/${solicitacao.id}`;
  const rotuloDaEtapa = STAGES[etapaDestino].label;
  const valor =
    solicitacao.estimatedValue !== null ? formatCurrency(Number(solicitacao.estimatedValue)) : "não informado";

  // 1. O SOLICITANTE, só nos marcos. Recebia aviso nas doze transições, todas
  //    com o mesmo texto e nenhuma pedindo nada; doze avisos inúteis ensinam a
  //    ignorar o décimo terceiro. Ver MARCOS_DO_SOLICITANTE.
  if (solicitanteAcompanha(etapaDestino)) {
    const { subject, html } = templates.atualizacaoEtapa(
      solicitacao.requester.name,
      solicitacao.code,
      solicitacao.shortDescription,
      rotuloDaEtapa,
      link
    );
    await avisar({
      para: solicitacao.requester.email,
      assunto: subject,
      html,
      slack:
        `*${solicitacao.code} avançou para ${rotuloDaEtapa}*\n${solicitacao.shortDescription}\n` +
        `Nada é necessário da sua parte neste momento.\n<${link}|Acompanhar a solicitação>`,
      requestId: solicitacao.id,
      origem: `avanco de etapa para ${etapaDestino}`,
    });
  }

  // 2. QUEM PRECISA AGIR, em toda entrada de etapa. Não existia: a solicitação
  //    chegava em Cotação e nenhum comprador sabia, chegava no Jurídico e o
  //    Jurídico não era avisado. O trabalho só andava porque alguém abria
  //    "Minhas Pendências" por hábito.
  //
  //    Nunca avisa quem acabou de agir: a pessoa que empurrou a solicitação
  //    para esta etapa não precisa ser convocada para ela, e receber DM do
  //    próprio clique é o ruído que desacredita a notificação.
  const convocados = await convocadosDaEtapa(etapaDestino, solicitacao.buyerId);
  await Promise.all(
    convocados
      .filter((pessoa) => pessoa.email !== solicitacao.requester.email)
      .map((pessoa) => {
        const msg = convocacao({
          nome: pessoa.name,
          codigo: solicitacao.code,
          descricao: solicitacao.shortDescription,
          etapa: etapaDestino,
          solicitante: solicitacao.requester.name,
          valor,
          link,
        });
        return avisar({
          para: pessoa.email,
          assunto: msg.assunto,
          html: msg.html,
          slack: msg.slack,
          requestId: solicitacao.id,
          origem: `convocacao para ${etapaDestino}`,
        });
      }),
  );
}
