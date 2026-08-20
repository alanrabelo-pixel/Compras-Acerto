import type { Attachment, AttachmentCategory } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Comprovante de aprovação do FP&A das solicitações abertas como "Orçamento
 * Extra" (isto é, sem linha de orçamento: PurchaseRequest.extraBudget).
 *
 * A exigência existia só no formulário (ver NovaSolicitacaoForm: o botão
 * Enviar fica desabilitado sem o arquivo). A API aceitava sem checar, então
 * uma chamada direta, ou um upload que falhasse depois da criação, produzia
 * uma compra extra-orçamentária sem o documento que a sustenta.
 *
 * A regra NÃO pode morar na criação da solicitação: o anexo só é enviável
 * DEPOIS que a solicitação existe, porque POST /api/requests/[id]/attachments
 * precisa do id dela (o formulário faz create e só então uploadIfPresent).
 * Exigir o arquivo no mesmo POST quebraria o próprio formulário. Por isso a
 * checagem fica nas PORTAS DE SAÍDA das etapas seguintes, que é onde o
 * documento já pode existir: Aprovação do Gestor (primeira transição depois
 * da criação) e os dois ramos da Validação Orçamentária.
 *
 * Este helper concentra a regra para os três pontos não divergirem.
 */

/**
 * Categoria do anexo que serve de comprovante. Exportada porque a tela da
 * solicitação também precisa dela (para separar o painel desse documento dos
 * demais anexos, ver src/app/solicitacoes/[id]/page.tsx) e "qual anexo conta"
 * tem que continuar sendo uma decisão de um lugar só.
 */
export const CATEGORIA_COMPROVANTE_FPA: AttachmentCategory = "APROVACAO_EXTRA_ORCAMENTARIA";

export type ChecagemDoComprovante =
  | { ok: true; comprovante: Attachment | null }
  | { ok: false; erro: string };

/**
 * @param acaoBloqueada trecho final da mensagem, com o que a pessoa está
 * tentando fazer (ex: "antes de aprovar a solicitação").
 * @param exigirMesmoSemMarcacao para o caminho em que o próprio sistema conclui
 * que a compra é extra-orçamentária, e não depende mais do que o solicitante
 * marcou: abertura de exceção por indisponibilidade de orçamento.
 */
export async function checarComprovanteDoFpa(
  request: { id: string; extraBudget: boolean },
  acaoBloqueada: string,
  exigirMesmoSemMarcacao = false
): Promise<ChecagemDoComprovante> {
  // Buscado também quando extraBudget é false, de propósito: o formulário
  // envia este anexo sempre que a pessoa escolhe um arquivo, mesmo com linha
  // de orçamento informada, e a exceção orçamentária vincula o documento
  // quando ele existe. Só a EXIGÊNCIA é condicionada a extraBudget.
  const comprovante = await prisma.attachment.findFirst({
    where: { requestId: request.id, category: CATEGORIA_COMPROVANTE_FPA },
    orderBy: { createdAt: "desc" },
  });

  // `exigirMesmoSemMarcacao` fecha o caso espelhado, que é o mais comum dos
  // dois: o comprador conclui "não há orçamento" numa solicitação que ninguém
  // marcou como Orçamento Extra. O controle inteiro dependia de um booleano
  // que o solicitante declara sozinho na criação, e bastava digitar qualquer
  // coisa no campo Linha do Orçamento para desligá-lo nos três pontos de
  // cobrança de uma vez. Abrir uma exceção orçamentária É o caso
  // extra-orçamentário, independente do que foi marcado lá atrás.
  if ((request.extraBudget || exigirMesmoSemMarcacao) && !comprovante) {
    return {
      ok: false,
      erro:
        "Esta solicitação foi aberta como Orçamento Extra e ainda não tem o comprovante de aprovação do FP&A anexado. " +
        `Anexe o documento na solicitação ${acaoBloqueada}.`,
    };
  }

  return { ok: true, comprovante };
}
