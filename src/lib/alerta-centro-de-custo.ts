import { formatCurrency, formatDateOnly } from "@/lib/format";
import { PRIORITY_LABEL, DEMAND_TYPE_LABEL, rotulo } from "@/lib/rotulos";
import { BASE_DE_ORCAMENTO_EXTRA_LABEL, IMPACTO_DE_ORCAMENTO_EXTRA_LABEL } from "@/lib/orcamento-extra";
import type { ExtraBudgetBasis, ExtraBudgetImpact } from "@prisma/client";

/**
 * Alerta ao gestor do centro de custo quando uma solicitação é aberta nele.
 *
 * É AVISO, NÃO APROVAÇÃO. A etapa Aprovação do Gestor saiu do fluxo em
 * 21/08/2026 e a solicitação segue direto para a Triagem sem esperar ninguém.
 * O gestor é avisado porque é o dono do orçamento e precisa saber o que entra
 * no centro de custo dele, não porque tenha algo a decidir. A mensagem diz
 * isso com todas as letras, senão quem recebe fica esperando um botão que não
 * existe, ou pior, assume que a compra está parada aguardando ele.
 *
 * Mora aqui, e não dentro de POST /api/requests, porque tem duas regras que
 * merecem teste próprio: quem recebe, e o que a mensagem diz. Testá-las pela
 * rota exigiria interceptar o Slack e ler o texto de dentro de um mock.
 */

/**
 * Quem recebe o alerta: todos os gestores do centro de custo, MENOS quem abriu
 * a solicitação.
 *
 * O recorte existe por pedido do dono do sistema, e a razão é prática: o
 * gestor que abre a própria solicitação já sabe dela, e receber um DM
 * anunciando o que acabou de fazer é o tipo de ruído que ensina a ignorar a
 * notificação inteira. A comparação é por id, não por e-mail: e-mail pode
 * mudar de caixa (alias, encaminhamento) e id não.
 *
 * Devolver lista vazia é resultado legítimo, não erro. Acontece sempre que um
 * gestor abre solicitação num centro de custo que ele administra sozinho, que
 * é o caso mais comum de todos.
 */
export function gestoresParaAvisar<T extends { id: string }>(gestores: T[], solicitanteId: string): T[] {
  return gestores.filter((gestor) => gestor.id !== solicitanteId);
}

export type ResumoDaSolicitacao = {
  code: string;
  shortDescription: string;
  requesterName: string;
  costCenterName: string;
  estimatedValue: number | null;
  priority: string;
  demandType: string;
  suggestedDeadline: Date | string;
  extraBudget: boolean;
  extraBudgetBasis?: ExtraBudgetBasis | null;
  extraBudgetImpact?: ExtraBudgetImpact | null;
  extraBudgetStart?: Date | string | null;
  extraBudgetEnd?: Date | string | null;
  linkDaSolicitacao: string;
};

/**
 * Texto do DM. Formatação do Slack (mrkdwn): *negrito* e <url|rótulo>.
 *
 * A ordem das linhas segue o que o gestor de orçamento pergunta primeiro:
 * quanto custa, de quem é, e se sai da linha prevista. Descrição e prazo vêm
 * depois. O aviso de que não há nada a aprovar vem por último, colado no link,
 * que é onde a pessoa vai clicar.
 */
/**
 * Mesmo conteúdo do resumo do Slack, em HTML para o e-mail.
 *
 * Existe desde 21/08/2026, quando o dono do sistema definiu que comunicação
 * geral vai pelos dois canais: o alerta ao gestor saía só no Slack, e o gestor
 * de orçamento é justamente o perfil que costuma viver no e-mail.
 */
export function resumoParaOGestorEmHtml(r: ResumoDaSolicitacao): { assunto: string; html: string } {
  const valor = r.estimatedValue !== null ? formatCurrency(r.estimatedValue) : "não informado";
  const extra = r.extraBudget
    ? `<p><b>Orçamento Extra:</b> aberta sem linha de orçamento prevista.<br/>` +
      `Valor solicitado: ${valor}${r.extraBudgetBasis ? ` ${BASE_DE_ORCAMENTO_EXTRA_LABEL[r.extraBudgetBasis]}` : ""}` +
      `${r.extraBudgetImpact ? ` · ${IMPACTO_DE_ORCAMENTO_EXTRA_LABEL[r.extraBudgetImpact]}` : ""}` +
      `${
        r.extraBudgetStart && r.extraBudgetEnd
          ? `<br/>Vigência: ${formatDateOnly(r.extraBudgetStart)} a ${formatDateOnly(r.extraBudgetEnd)}`
          : ""
      }</p>`
    : "";

  return {
    assunto: `Nova solicitação no centro de custo ${r.costCenterName}: ${r.code}`,
    html:
      `<p><b>${r.code}</b> · ${r.shortDescription}</p>` +
      `<p>Valor estimado: <b>${valor}</b><br/>` +
      `Solicitante: ${r.requesterName}<br/>` +
      `Tipo: ${rotulo(DEMAND_TYPE_LABEL, r.demandType)} · Prioridade: ${rotulo(PRIORITY_LABEL, r.priority)}<br/>` +
      `Prazo sugerido: ${formatDateOnly(r.suggestedDeadline)}</p>` +
      extra +
      `<p>Este é um aviso, não um pedido de aprovação: a solicitação já seguiu para a Triagem com o time de Compras e não depende de nenhuma ação sua.</p>` +
      `<p><a href="${r.linkDaSolicitacao}">Ver a solicitação completa</a></p>`,
  };
}

export function resumoParaOGestor(r: ResumoDaSolicitacao): string {
  const valor = r.estimatedValue !== null ? formatCurrency(r.estimatedValue) : "não informado";

  const linhas = [
    `*Nova solicitação no centro de custo ${r.costCenterName}*`,
    "",
    `*${r.code}* · ${r.shortDescription}`,
    `Valor estimado: ${valor}`,
    `Solicitante: ${r.requesterName}`,
    `Tipo: ${rotulo(DEMAND_TYPE_LABEL, r.demandType)} · Prioridade: ${rotulo(PRIORITY_LABEL, r.priority)}`,
    `Prazo sugerido: ${formatDateOnly(r.suggestedDeadline)}`,
  ];

  // Orçamento Extra é a informação que mais interessa a um dono de orçamento,
  // então ganha bloco próprio em vez de virar mais uma linha na lista.
  if (r.extraBudget) {
    const base = r.extraBudgetBasis ? ` ${BASE_DE_ORCAMENTO_EXTRA_LABEL[r.extraBudgetBasis]}` : "";
    const impacto = r.extraBudgetImpact ? IMPACTO_DE_ORCAMENTO_EXTRA_LABEL[r.extraBudgetImpact] : null;
    const vigencia = r.extraBudgetStart && r.extraBudgetEnd
      ? `${formatDateOnly(r.extraBudgetStart)} a ${formatDateOnly(r.extraBudgetEnd)}`
      : null;

    linhas.push(
      "",
      `:warning: *Orçamento Extra*: aberta sem linha de orçamento prevista.`,
      `Valor solicitado: ${valor}${base}${impacto ? ` · ${impacto}` : ""}`,
      ...(vigencia ? [`Vigência: ${vigencia}`] : []),
    );
  }

  linhas.push(
    "",
    "Este é um aviso, não um pedido de aprovação: a solicitação já seguiu para a Triagem com o time de Compras e não depende de nenhuma ação sua.",
    `<${r.linkDaSolicitacao}|Ver a solicitação completa>`,
  );

  return linhas.join("\n");
}
