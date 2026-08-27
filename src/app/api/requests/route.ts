import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { slaDaysForDiretoria } from "@/lib/workflow";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";
import { sendSlackDM } from "@/lib/integrations/slack";
import { proximoCodigo } from "@/lib/codigo";
import { campo } from "@/lib/rotulos";
import { BASES_DE_ORCAMENTO_EXTRA, IMPACTOS_DE_ORCAMENTO_EXTRA } from "@/lib/orcamento-extra";
import { gestoresParaAvisar, resumoParaOGestor, resumoParaOGestorEmHtml } from "@/lib/alerta-centro-de-custo";
import { avisar } from "@/lib/avisar";
import { USUARIO_PUBLICO } from "@/lib/usuario";
import { atorDaSessao, exigirQuadro } from "@/lib/acesso";
import { validarCorpo, comExcecaoControlada } from "@/lib/validacao-api";

/**
 * Achado do DAST de 25/08/2026: string de ~120 caracteres aleatórios no campo
 * "priority" derrubava a rota com 500. priority é enum no Prisma
 * (BAIXA/MEDIA/ALTA/CRITICA); um valor fora da lista chegava direto ao
 * create() e o Prisma lançava exceção de validação não tratada. Este schema
 * valida só o FORMATO — a presença dos campos obrigatórios continua no laço
 * `required` logo abaixo, que já existia e trata a lógica condicional de
 * Orçamento Extra, mais específica do que um schema genérico daria conta.
 */
const camposDeFormato = z.object({
  diretoria: z.enum(["CORPORATIVO", "REVENUE", "TECNOLOGIA"]).optional(),
  priority: z.enum(["BAIXA", "MEDIA", "ALTA", "CRITICA"]).optional(),
  demandType: z
    .enum([
      "COMPRA_PRODUTO",
      "COMPRA_SERVICO",
      "FERRAMENTA_NOVA",
      "FERRAMENTA_USUARIOS",
      "FERRAMENTA_UPGRADE_DOWNGRADE",
      "RENOVACAO_CONTRATO",
      "CANCELAMENTO",
    ])
    .optional(),
  shortDescription: z.string().max(500).optional(),
  longDescription: z.string().max(5000).optional(),
  urgencyJustification: z.string().max(2000).optional(),
  indicatedSupplierName: z.string().max(200).optional(),
  indicatedSupplierPhone: z.string().max(50).optional(),
  indicatedSupplierEmail: z.string().email().max(200).optional().or(z.literal("")),
  indicatedSupplierWebsite: z.string().max(500).optional(),
  quantity: z.union([z.number(), z.string()]).optional(),
  estimatedValue: z.union([z.number(), z.string()]).optional(),
});

// GET /api/requests: lista solicitações (para o Kanban / listagem)
export async function GET(req: NextRequest) {
  // Listagem ampla, sem recorte por registro: devolve a carteira inteira da
  // empresa. Não há filtro por solicitante nesta rota (só `stage`), então não
  // existe recorte "só as minhas" a preservar aqui; quem não vê o quadro é
  // barrado. A tela /solicitacoes/minhas não passa por esta rota, ela consulta
  // o Prisma direto no servidor com where.requesterId.
  const barrado = await exigirQuadro("o quadro de solicitações");
  if (barrado) return barrado;

  const stage = req.nextUrl.searchParams.get("stage");
  const requests = await prisma.purchaseRequest.findMany({
    where: stage ? { currentStage: stage as never } : undefined,
    include: {
      requester: { select: USUARIO_PUBLICO },
      costCenter: true,
      approverManager: { select: USUARIO_PUBLICO },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(requests);
}

// POST /api/requests: cria uma nova Solicitação de Compra (ver Nova
// Solicitação na UI).
export async function POST(req: NextRequest) {
  return comExcecaoControlada("POST /api/requests", async () => {
  const body = await req.json();

  const validacaoDeFormato = validarCorpo(camposDeFormato, body);
  if (!validacaoDeFormato.ok) return validacaoDeFormato.resposta;

  const {
    requesterId,
    diretoria,
    costCenterId,
    leadershipPreApproved,
    budgetLineText,
    extraBudget,
    extraBudgetBasis,
    extraBudgetStart,
    extraBudgetEnd,
    extraBudgetImpact,
    extraBudgetJustification,
    priority,
    demandType,
    shortDescription,
    longDescription,
    urgencyJustification,
    suggestedDeadline,
    indicatedSupplierName,
    indicatedSupplierPhone,
    indicatedSupplierEmail,
    indicatedSupplierWebsite,
    quantity,
    estimatedValue,
    affectedUsers,
  } = body;

  // Quem está abrindo a solicitação: a SESSÃO manda, o corpo só entra quando
  // não há sessão nenhuma (desenvolvimento local com LOCAL_BYPASS_AUTH, onde o
  // formulário roda sem SSO e escolhe o solicitante no UserPicker).
  //
  // Antes, requesterId vinha do corpo e nunca era comparado com a sessão: com
  // um POST direto dava para abrir solicitação em nome de outra pessoa, e a
  // confirmação de recebimento (sendPurchaseEmail abaixo) chegava na caixa
  // dela, com a descrição da compra que ela não pediu. O StageEvent de
  // abertura também registrava a pessoa errada como autora.
  //
  // Nenhum papel é exigido aqui de propósito: abrir solicitação é de qualquer
  // colaborador, o recorte é só de identidade.
  const ator = await atorDaSessao();
  const solicitanteId = ator?.id ?? requesterId;

  // Validação mínima dos campos obrigatórios (marcados com * no formulário).
  // estimatedValue NÃO é obrigatório aqui, de propósito: ver
  // gate na Triagem, que exige o valor antes de calcular alçada/lane.
  //
  // budgetLineText é dispensado quando extraBudget=true ("Orçamento Extra"
  // selecionado no lugar de uma linha); nesse caso o formulário exige o
  // anexo de Aprovação Extra-orçamentária em vez do texto da linha.
  //
  // approverManagerId NÃO vem mais do formulário (pedido do usuário: o gestor
  // aprovador é o dono do centro de custo escolhido, resolvido abaixo via
  // CostCenter.managerId, não uma escolha manual do solicitante).
  const required = {
    requesterId: solicitanteId, diretoria, costCenterId, leadershipPreApproved,
    priority, demandType, shortDescription, longDescription,
    suggestedDeadline, quantity,
  };
  for (const [key, value] of Object.entries(required)) {
    if (value === undefined || value === null || value === "") {
      return NextResponse.json({ error: `Preencha o campo ${campo(key)} antes de enviar a solicitação.` }, { status: 400 });
    }
  }
  if (!budgetLineText && !extraBudget) {
    return NextResponse.json({ error: "Informe a Linha do Orçamento, ou marque Orçamento Extra se não houver uma." }, { status: 400 });
  }

  // Prioridade Alta/Crítica fura fila e pressiona prazo de outras
  // solicitações (ver o aviso na tela). Pedido do usuário: exigir o motivo da
  // urgência e por que não foi antecipada, mesmo princípio do detalhamento do
  // Orçamento Extra logo abaixo. Validado aqui (não no banco) pelo mesmo
  // motivo: Baixa/Média e o histórico anterior a esta coluna não têm como
  // preenchê-la.
  const ehUrgente = priority === "ALTA" || priority === "CRITICA";
  if (ehUrgente && !urgencyJustification?.trim()) {
    return NextResponse.json(
      { error: "Prioridade Alta/Crítica exige o motivo da urgência e por que não foi antecipada." },
      { status: 400 },
    );
  }

  // Detalhamento do Orçamento Extra: obrigatório na rota, não no banco. As
  // colunas são anuláveis porque as solicitações que já existiam não têm como
  // preenchê-las, e uma CHECK condicional travaria o histórico.
  //
  // estimatedValue entra na lista SÓ neste caso, e é a exceção à regra da
  // linha 76: em compra comum o valor pode faltar e a Triagem cobra depois,
  // mas aqui ele é o que define se decide a Coordenação ou o Gerente F&NC
  // (budgetExceptionLevel). Sem valor não há alçada, e a solicitação chegaria
  // à Validação Orçamentária sem ninguém definido para decidi-la.
  if (extraBudget) {
    const detalhamento = {
      estimatedValue,
      extraBudgetBasis,
      extraBudgetStart,
      extraBudgetEnd,
      extraBudgetImpact,
      extraBudgetJustification,
    };
    for (const [chave, valor] of Object.entries(detalhamento)) {
      if (valor === undefined || valor === null || valor === "") {
        return NextResponse.json(
          { error: `Orçamento Extra exige o detalhamento completo. Preencha o campo ${campo(chave)}.` },
          { status: 400 },
        );
      }
    }
    if (!BASES_DE_ORCAMENTO_EXTRA.includes(extraBudgetBasis)) {
      return NextResponse.json({ error: "Base do valor inválida. Use mensal, anual ou total." }, { status: 400 });
    }
    if (!IMPACTOS_DE_ORCAMENTO_EXTRA.includes(extraBudgetImpact)) {
      return NextResponse.json({ error: "Impacto financeiro inválido. Use recorrente ou pontual." }, { status: 400 });
    }
    if (new Date(extraBudgetEnd) < new Date(extraBudgetStart)) {
      return NextResponse.json({ error: "O fim da vigência não pode ser anterior ao início." }, { status: 400 });
    }
  }

  // Orçamento Extra: o comprovante de aprovação do FP&A NÃO é exigido aqui, e
  // isso é decisão, não esquecimento. O anexo só pode existir depois que a
  // solicitação existe, porque POST /api/requests/[id]/attachments precisa do
  // id dela: o formulário cria a solicitação e só então faz uploadIfPresent
  // (ver NovaSolicitacaoForm). Exigir o arquivo neste mesmo POST tornaria o
  // formulário impossível de enviar.
  //
  // Marcar a solicitação como "pendente de comprovante" também foi descartado:
  // exigiria uma coluna nova em PurchaseRequest (migração), e a informação já
  // é derivável do que está gravado (extraBudget=true sem Attachment de
  // categoria APROVACAO_EXTRA_ORCAMENTARIA).
  //
  // A cobrança fica na porta de saída seguinte, PATCH
  // /api/requests/[id]/aprovacao-gestor, que é a primeira transição depois da
  // criação, e nos dois ramos da Validação Orçamentária. Regra única em
  // @/lib/orcamento-extra (checarComprovanteDoFpa).

  const costCenter = await prisma.costCenter.findUnique({
    where: { id: costCenterId },
    include: { managers: { select: USUARIO_PUBLICO, orderBy: { name: "asc" } } },
  });
  if (!costCenter) return NextResponse.json({ error: "Centro de custo não encontrado" }, { status: 404 });
  // Mais de um gestor pode estar configurado (pedido do usuário): o primeiro
  // (ordem alfabética) fica como approverManagerId "principal" (FK única em
  // PurchaseRequest), mas TODOS são notificados e qualquer um pode decidir
  // (ver PATCH /api/requests/[id]/aprovacao-gestor).
  const approverManagerId = costCenter.managers[0]?.id ?? null;

  const code = await proximoCodigo("PC");

  const slaDays = slaDaysForDiretoria(diretoria, priority);
  const slaDeadline = new Date();
  slaDeadline.setDate(slaDeadline.getDate() + slaDays);

  const request = await prisma.purchaseRequest.create({
    data: {
      code,
      requesterId: solicitanteId,
      diretoria,
      costCenterId,
      leadershipPreApproved,
      approverManagerId,
      budgetLineText,
      // Era lido da requisição e descartado: a solicitação ficava sem linha de
      // orçamento e sem nenhum registro de que era extra-orçamentária, e a
      // Validação Orçamentária perdia como saber que precisa exigir o
      // comprovante de aprovação do FP&A.
      extraBudget: Boolean(extraBudget),
      // Só gravados quando é Orçamento Extra. Se alguém mandar o detalhamento
      // junto de uma linha de orçamento comum, o campo é ignorado em vez de
      // gravado: solicitação com linha prevista não tem vigência de exceção, e
      // deixar o resíduo faria o painel do aprovador mostrar dado sem sentido.
      extraBudgetBasis: extraBudget ? extraBudgetBasis : null,
      extraBudgetStart: extraBudget ? new Date(extraBudgetStart) : null,
      extraBudgetEnd: extraBudget ? new Date(extraBudgetEnd) : null,
      extraBudgetImpact: extraBudget ? extraBudgetImpact : null,
      extraBudgetJustification: extraBudget ? extraBudgetJustification : null,
      priority,
      urgencyJustification: ehUrgente ? urgencyJustification : null,
      demandType,
      shortDescription,
      longDescription,
      suggestedDeadline: new Date(suggestedDeadline),
      indicatedSupplierName,
      indicatedSupplierPhone,
      indicatedSupplierEmail,
      indicatedSupplierWebsite,
      quantity,
      estimatedValue: estimatedValue || undefined,
      affectedUsers,
      currentStage: "SOLICITACAO",
      slaDeadline,
    },
    include: {
      requester: { select: USUARIO_PUBLICO },
      approverManager: { select: USUARIO_PUBLICO },
    },
  });

  await prisma.stageEvent.create({
    data: { requestId: request.id, toStage: "SOLICITACAO", actorId: solicitanteId },
  });

  // Confirmação de recebimento ao solicitante, pelos dois canais.
  const linkDaSolicitacao = `${process.env.APP_URL}/solicitacoes/${request.id}`;
  const confirmacao = templates.confirmacaoRecebimento(
    request.requester.name,
    request.code,
    shortDescription,
    linkDaSolicitacao,
  );
  await avisar({
    para: request.requester.email,
    assunto: confirmacao.subject,
    html: confirmacao.html,
    slack:
      `*Solicitação ${request.code} recebida*\n${shortDescription}\n` +
      `Seguiu para a Homologação e Triagem, com o time de Compras.\n` +
      `<${linkDaSolicitacao}|Acompanhar a solicitação>`,
    requestId: request.id,
    origem: "confirmacao de recebimento",
  });

  // Alerta ao gestor do centro de custo, por Slack. É AVISO, não convocação:
  // a etapa Aprovação do Gestor saiu do fluxo em 21/08/2026 e a solicitação
  // não espera ninguém. O gestor é avisado porque é o dono do orçamento.
  //
  // Todos os gestores, não só o principal, MENOS quem abriu a solicitação:
  // avisar alguém do que ela mesma acabou de fazer é o ruído que ensina a
  // ignorar a notificação. Regra e texto em @/lib/alerta-centro-de-custo,
  // onde têm teste próprio.
  const gestoresAvisados = gestoresParaAvisar(costCenter.managers, solicitanteId);
  const dadosDoResumo = {
    code: request.code,
    shortDescription: request.shortDescription,
    requesterName: request.requester.name,
    costCenterName: costCenter.name,
    estimatedValue: request.estimatedValue !== null ? Number(request.estimatedValue) : null,
    priority: request.priority,
    demandType: request.demandType,
    suggestedDeadline: request.suggestedDeadline,
    extraBudget: request.extraBudget,
    extraBudgetBasis: request.extraBudgetBasis,
    extraBudgetImpact: request.extraBudgetImpact,
    extraBudgetStart: request.extraBudgetStart,
    extraBudgetEnd: request.extraBudgetEnd,
    linkDaSolicitacao: `${process.env.APP_URL}/solicitacoes/${request.id}`,
  };

  // Pelos dois canais desde 21/08/2026: o gestor de orçamento é justamente o
  // perfil que costuma viver no e-mail, e o alerta saía só no Slack. Os dois
  // formatos saem dos MESMOS dados, para não divergirem com o tempo.
  const resumo = resumoParaOGestor(dadosDoResumo);
  const resumoEmail = resumoParaOGestorEmHtml(dadosDoResumo);
  await Promise.all(
    gestoresAvisados.map((manager) =>
      avisar({
        para: manager.email,
        assunto: resumoEmail.assunto,
        html: resumoEmail.html,
        slack: resumo,
        requestId: request.id,
        origem: "alerta ao gestor do centro de custo",
      }),
    ),
  );

  // Link reaproveitado do aviso acima; nao recalcula.
  // Vai direto para a Triagem. A Aprovação do Gestor saiu do fluxo em
  // 21/08/2026 (ver a nota de legado em STAGES.APROVACAO_GESTOR): quem faz o
  // primeiro crivo é o comprador. Gasto sem orçamento continua controlado,
  // pela exceção orçamentária na Validação Orçamentária, e o valor continua
  // controlado pela alçada na etapa Aprovação.
  const updated = await prisma.purchaseRequest.update({
    where: { id: request.id },
    data: { currentStage: "TRIAGEM" },
  });
  await prisma.stageEvent.create({
    data: { requestId: request.id, fromStage: "SOLICITACAO", toStage: "TRIAGEM" },
  });

  return NextResponse.json(updated, { status: 201 });
  });
}
