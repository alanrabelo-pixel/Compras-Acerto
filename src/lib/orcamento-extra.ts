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

/**
 * Detalhamento do Orçamento Extra, coletado no modal da abertura.
 *
 * As listas existem para a rota validar o que chega pelo corpo: o enum do
 * Prisma vive no banco e não sobrevive a um JSON, então sem elas um POST
 * direto com extraBudgetBasis: "SEMESTRAL" só falharia lá no create, com erro
 * de driver em vez de mensagem para quem preencheu.
 */
export const BASES_DE_ORCAMENTO_EXTRA = ["MENSAL", "ANUAL", "TOTAL"] as const;
export const IMPACTOS_DE_ORCAMENTO_EXTRA = ["RECORRENTE", "PONTUAL"] as const;

export const BASE_DE_ORCAMENTO_EXTRA_LABEL: Record<(typeof BASES_DE_ORCAMENTO_EXTRA)[number], string> = {
  MENSAL: "por mês",
  ANUAL: "por ano",
  TOTAL: "no total",
};

export const IMPACTO_DE_ORCAMENTO_EXTRA_LABEL: Record<(typeof IMPACTOS_DE_ORCAMENTO_EXTRA)[number], string> = {
  RECORRENTE: "Recorrente",
  PONTUAL: "Custo pontual",
};

/**
 * Documento de apoio do orçamento, quando existir. OPCIONAL.
 *
 * ATÉ 21/08/2026 ISTO ERA UMA EXIGÊNCIA, e bloqueava cinco pontos do fluxo com
 * 422: o atalho de cancelamento na Triagem, os dois ramos da Validação
 * Orçamentária, a aprovação da exceção, e um aviso na tela. A regra caiu por
 * decisão do dono do sistema, e a razão é que ela ficou redundante:
 *
 * O anexo era o print de um e-mail em que o FP&A aprovava o gasto fora do
 * orçamento. Era prova externa porque o sistema não tinha prova própria. Hoje
 * tem: o solicitante detalha valor, base, vigência, impacto e motivo num modal
 * na abertura (colunas extraBudget* em PurchaseRequest), e a Coordenação ou o
 * Gerente F&NC decide a exceção DENTRO do sistema, com nível, decisão, autor,
 * justificativa e data gravados em BudgetException. O registro da aprovação
 * passou a ser o próprio banco, e exigir o print de um e-mail sobre a mesma
 * decisão é pedir duas vezes a mesma coisa, sendo que a segunda é pior.
 *
 * O campo continua existindo, opcional, por dois motivos: solicitações
 * anteriores a esta data já têm arquivos nesta categoria e sumiriam da tela se
 * o painel fosse removido, e quem tiver documentação de apoio ainda pode
 * juntá-la. O que não existe mais é qualquer caminho em que a ausência do
 * arquivo impeça a solicitação de andar.
 */
export async function anexoDeApoioDoOrcamento(requestId: string): Promise<Attachment | null> {
  return prisma.attachment.findFirst({
    where: { requestId, category: CATEGORIA_COMPROVANTE_FPA },
    orderBy: { createdAt: "desc" },
  });
}
