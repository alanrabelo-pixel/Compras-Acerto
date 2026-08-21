import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { faixasAtivas, faixaDoValor, assinaturasExigidas } from "@/lib/alcadas";
import {
  canPersonifyApprover,
  nextAfterAprovacao,
  APPROVAL_ESCALATION_BUSINESS_DAYS,
  somarDiasUteis,
} from "@/lib/workflow";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";
import { sendSlackDM } from "@/lib/integrations/slack";
import { requireRole } from "@/lib/rbac";
import { exigirPapel } from "@/lib/acesso";
import { ehProducao } from "@/lib/ambiente";
import { avancarEtapa } from "@/lib/etapa";
import { logger } from "@/lib/logger";
import { USUARIO_PUBLICO, USUARIO_RESUMIDO } from "@/lib/usuario";

/**
 * POST /api/requests/[id]/aprovacao
 *
 * Cria o(s) registro(s) de aprovação na alçada correta (Nível 1/2/3,
 * renumerado na revisão v1.1). Pedido do usuário: Nível 1 exige 1
 * aprovador; Níveis 2 e 3 exigem 2 aprovadores DISTINTOS decidindo em
 * conjunto (dupla checagem): a solicitação só avança quando TODOS
 * aprovarem (ver PATCH abaixo). Define o prazo (dueAt) de cada um para
 * escalonamento automático.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // Quem CRIA o lote de aprovação é o comprador, roteando a solicitação para a
  // alçada. Isso nunca foi verificado: o requireRole mais abaixo valida o papel
  // de quem VAI RECEBER a aprovação, com requireSelf false, e ninguém olhava
  // quem estava chamando. Qualquer conta autenticada abria a aprovação de uma
  // compra na etapa de Aprovação e, quando a alçada não tem pool configurado,
  // escolhia para quais aprovadores ela ia.
  const barrado = await exigirPapel(["COMPRADOR"], "criar a aprovação desta solicitação");
  if (barrado) return barrado;

  const request = await prisma.purchaseRequest.findUnique({ where: { id: params.id } });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "APROVACAO") {
    return NextResponse.json({ error: "Solicitação não está na etapa de Aprovação" }, { status: 409 });
  }

  const body = await req.json();

  // A alçada saía do valor ESTIMADO declarado na Triagem e nunca era
  // reconferida. Uma compra estimada em R$ 40 mil que fechasse em R$ 700 mil
  // era aprovada como Nível 1, por uma assinatura só, porque o valor que a
  // empresa de fato vai pagar não entrava na conta em lugar nenhum.
  //
  // A fonte do valor negociado nesta etapa é a cotação vencedora escolhida no
  // Mapa de Cotação (Quote.selected). O Pedido de Compra ainda não existe
  // aqui: ele é emitido depois da aprovação.
  //
  // DECISÃO DO DONO DO SISTEMA: quando existe cotação vencedora, ela manda,
  // mesmo que o valor tenha CAÍDO e a alçada desça junto. O raciocínio é que a
  // alçada deve refletir o que a empresa paga. O risco aceito, registrado aqui
  // para quem revisar: uma compra estimada logo acima de uma faixa pode descer
  // de faixa ao ser negociada e perder a segunda assinatura. É pequeno, porque
  // negociar para baixo é o comportamento desejado, mas não é nulo.
  const cotacaoVencedora = await prisma.quote.findFirst({
    where: { requestId: request.id, selected: true },
    select: { negotiatedValue: true },
    orderBy: { createdAt: "desc" },
  });
  const valorDaAlcada = cotacaoVencedora
    ? Number(cotacaoVencedora.negotiatedValue)
    : Number(request.estimatedValue);

  // Faixas vindas do banco desde 21/08/2026 (ApprovalTier, editáveis em
  // /admin/centros-de-custo). Sem faixa que cubra o valor, a aprovação é
  // recusada em vez de cair num padrão: aprovar como se fosse a menor alçada
  // seria exatamente o erro que a escada existe para impedir.
  const faixas = await faixasAtivas();
  const faixa = faixaDoValor(faixas, valorDaAlcada);
  if (!faixa) {
    return NextResponse.json(
      {
        error:
          "Nenhuma faixa de alçada ativa cobre este valor. Configure as alçadas em Administração > Centros de Custo " +
          "antes de criar a aprovação.",
      },
      { status: 422 },
    );
  }
  const level = faixa.level;
  const required = assinaturasExigidas(faixa);

  // Aprovador(es) padrão da alçada (ApprovalLevelApprover, ver
  // /admin/centros-de-custo): quando o pool tem gente suficiente, os
  // primeiros (ordem alfabética) são usados automaticamente. Sem gente
  // suficiente configurada, cai no fallback antigo: o comprador informa
  // manualmente `approverIds` (ou `approverId`, quando required=1) com
  // exatamente `required` pessoas DISTINTAS.
  const levelPool = await prisma.approvalLevelApprover.findMany({
    where: { level },
    include: { user: { select: USUARIO_PUBLICO } },
  });
  levelPool.sort((a, b) => a.user.name.localeCompare(b.user.name));
  const poolIds = levelPool.map((p) => p.userId);

  let approverIds: string[];
  if (poolIds.length >= required) {
    approverIds = poolIds.slice(0, required);
  } else if (ehProducao()) {
    // DECISÃO DO DONO DO SISTEMA: em produção, sem pool configurado a
    // aprovação não é criada.
    //
    // O caminho manual abaixo existe desde o começo como recurso para quando a
    // alçada ainda não foi cadastrada, e em 20/08/2026 a tabela estava com ZERO
    // aprovadores nos três níveis, o que fazia dele o único caminho existente.
    // Na prática, o comprador escolhia quem aprova a própria compra. As
    // proteções que sobravam (o alvo precisa ter o papel Aprovador, e os níveis
    // 2 e 3 exigem duas pessoas distintas) são reais, mas nenhuma delas impede
    // a escolha de um aprovador conveniente.
    //
    // Fora de produção ele continua valendo, senão não há como exercitar o
    // fluxo no Sandbox antes de a configuração existir.
    return NextResponse.json(
      {
        error:
          `A alçada de Nível ${level} não tem aprovadores configurados, e em produção a ` +
          "aprovação não pode ser criada escolhendo aprovador caso a caso. Configure os " +
          "aprovadores em Administração, Centros de Custo, antes de seguir.",
      },
      { status: 422 }
    );
  } else {
    const manual: unknown = body.approverIds ?? (body.approverId ? [body.approverId] : []);
    if (!Array.isArray(manual) || manual.length !== required || !manual.every((id) => typeof id === "string")) {
      return NextResponse.json(
        {
          error: `Nível ${level} exige ${required} aprovador(es) distinto(s). Configure em Administração → Centros de Custo, ou informe manualmente.`,
        },
        { status: 422 }
      );
    }
    if (new Set(manual).size !== manual.length) {
      return NextResponse.json({ error: "Os aprovadores precisam ser pessoas diferentes: a mesma pessoa não pode assinar duas vezes." }, { status: 422 });
    }
    approverIds = manual as string[];
  }

  // requireSelf: false, pois approverId aqui é uma ATRIBUIÇÃO (o comprador está
  // roteando a solicitação para aprovador(es) específico(s) da alçada), não
  // necessariamente quem está logado clicando "Criar". Só o papel do alvo
  // (APROVADOR) é validado, sem exigir que a sessão seja essa mesma pessoa.
  for (const approverId of approverIds) {
    const roleError = await requireRole(approverId, ["APROVADOR"], { requireSelf: false });
    if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });
  }

  // Revisão v1.1: declaração de conflito de interesse é obrigatória antes da
  // Aprovação (ver ConflictOfInterestDeclaration no schema). Bloqueia se ainda
  // não foi declarada, ou se foi declarada COM conflito (exige reatribuição).
  const declaration = await prisma.conflictOfInterestDeclaration.findFirst({
    where: { requestId: request.id },
    orderBy: { createdAt: "desc" },
  });
  if (!declaration) {
    return NextResponse.json(
      { error: "Declaração de conflito de interesse ainda não foi registrada para esta solicitação." },
      { status: 422 }
    );
  }
  if (declaration.hasConflict) {
    return NextResponse.json(
      { error: "Há conflito de interesse declarado. Reatribua solicitante/comprador/aprovador antes de prosseguir." },
      { status: 422 }
    );
  }

  // Dias úteis de verdade. Antes somava dias corridos apesar do nome: uma
  // aprovação aberta numa quinta vencia no domingo, e o aprovador era cobrado
  // por um atraso que incluía o fim de semana.
  const dueAt = somarDiasUteis(new Date(), APPROVAL_ESCALATION_BUSINESS_DAYS);

  const approvals = await Promise.all(
    approverIds.map((approverId) => prisma.approval.create({ data: { requestId: request.id, level, approverId, dueAt } }))
  );

  return NextResponse.json({ approvals }, { status: 201 });
}

/**
 * PATCH /api/requests/[id]/aprovacao
 *
 * Decisão de UM aprovador específico (identificado por approvalId), ou
 * personificação controlada (comprador só até o Nível 1; um ADMIN, sem
 * teto, ver checagem abaixo). Quando o nível exige mais de um aprovador
 * (Níveis 2/3), a solicitação só avança depois que TODOS os aprovadores
 * daquele lote decidirem APROVADO; uma única reprovação já cancela,
 * independente do que falta decidir.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { approvalId, decision, justification, personifiedBy } = body;

  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: { requester: { select: USUARIO_PUBLICO } },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });

  const approval = await prisma.approval.findUnique({ where: { id: approvalId } });
  if (!approval || approval.requestId !== request.id) {
    return NextResponse.json({ error: "Aprovação não encontrada para esta solicitação" }, { status: 404 });
  }

  // `decision` era gravada crua. Como só "REPROVADO" e "PENDENTE" recebem
  // tratamento especial abaixo, qualquer outra string fazia a solicitação
  // avançar como se tivesse sido aprovada. Valida contra o enum antes de tudo.
  if (decision !== "APROVADO" && decision !== "REPROVADO") {
    return NextResponse.json(
      { error: "Decisão inválida. Envie APROVADO ou REPROVADO." },
      { status: 422 }
    );
  }

  if (personifiedBy) {
    const roleError = await requireRole(personifiedBy, ["COMPRADOR"]);
    if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

    // Pedido do usuário: o Administrador do sistema pode personificar o
    // aprovador "a qualquer momento, sempre que julgar necessário", sem o
    // teto de alçada que existe para a personificação normal do comprador
    // (só até o Nível 1).
    const personifierRoles = await prisma.userRole.findMany({ where: { userId: personifiedBy } });
    const personifierIsAdmin = personifierRoles.some((r) => r.role === "ADMIN");

    const faixasParaPersonificacao = await faixasAtivas();
    if (!personifierIsAdmin && !canPersonifyApprover(faixasParaPersonificacao, Number(request.estimatedValue))) {
      return NextResponse.json(
        {
          error:
            "Personificação de aprovador só é permitida na faixa de alçada mais baixa. Este valor exige decisão do " +
            "aprovador real.",
        },
        { status: 422 }
      );
    }
    if (!justification) {
      return NextResponse.json({ error: "Justificativa é obrigatória ao personificar um aprovador." }, { status: 422 });
    }
  } else {
    // Sem personificação, a decisão só pode ser registrada pelo próprio
    // aprovador designado. Antes disso não havia checagem nenhuma neste
    // caminho: bastava omitir `personifiedBy` para decidir qualquer aprovação,
    // em qualquer valor, sem papel e sem deixar rastro (personifiedBy fica
    // null, então o histórico atribuía a decisão ao aprovador legítimo).
    //
    // requireRole com requireSelf (padrão) resolve as duas checagens de uma
    // vez: que quem chama é de fato `approval.approverId`, e que essa pessoa
    // tem o papel APROVADOR.
    const roleError = await requireRole(approval.approverId, ["APROVADOR"]);
    if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });
  }

  await prisma.approval.update({
    where: { id: approvalId },
    data: { decision, justification, personifiedBy: personifiedBy ?? null, decidedAt: new Date() },
  });

  // Se personificado, notifica o aprovador real (transparência; não substitui a auditoria)
  if (personifiedBy) {
    const approver = await prisma.user.findUnique({
      where: { id: approval.approverId },
      select: USUARIO_RESUMIDO,
    });
    if (approver) {
      await sendSlackDM({
        slackUserEmail: approver.email,
        text: `A solicitação ${request.code} foi ${decision === "APROVADO" ? "aprovada" : "reprovada"} em seu nome pelo comprador, por urgência/ausência. Justificativa: ${justification}`,
        requestId: request.id,
      }).catch((erro) => {
        // Este aviso é o que dá ao aprovador real transparência de que
        // decidiram em nome dele. Falhar calado apaga justamente essa
        // transparência, então a falha precisa ficar registrada.
        logger.warn("aviso_personificacao_falhou", {
          solicitacao: request.code,
          aprovadorReal: approver.email,
          erro,
        });
      });
    }
  }

  if (decision === "REPROVADO") {
    const nextStage = nextAfterAprovacao({ approved: false, needsContract: Boolean(request.needsContract) });
    const cancelamento = await avancarEtapa({
      requestId: request.id,
      de: "APROVACAO",
      para: nextStage,
      comentario: justification,
      dadosExtras: { status: "CANCELADO", cancelReason: justification },
    });
    if (!cancelamento.ok) {
      return NextResponse.json({ error: cancelamento.erro }, { status: cancelamento.status });
    }
    const { subject, html } = templates.reprovado(request.requester.name, request.shortDescription, justification ?? "não informado");
    await sendPurchaseEmail({ to: request.requester.email, subject, html, requestId: request.id });
    return NextResponse.json({ status: "REPROVADO" });
  }

  // Nível 2/3 exige mais de um aprovador (ver approvalsRequiredForLevel):
  // só avança quando TODOS os do mesmo lote (mesmo requestId + level)
  // tiverem decidido APROVADO. Se ainda falta alguém, fica esperando.
  const batch = await prisma.approval.findMany({ where: { requestId: request.id, level: approval.level } });
  const stillWaiting = batch.some((a) => a.decision === "PENDENTE");
  if (stillWaiting) {
    const updatedApproval = await prisma.approval.findUnique({ where: { id: approvalId } });
    return NextResponse.json({ ...updatedApproval, waitingForOtherApprovers: true });
  }

  const nextStage = nextAfterAprovacao({ approved: true, needsContract: Boolean(request.needsContract) });

  // O guard atômico importa especialmente aqui: dois aprovadores de Nível 2 ou
  // 3 decidindo quase junto liam os dois o mesmo lote acima, viam ambos que
  // ninguém estava pendente, e ambos avançavam a etapa. O resultado era evento
  // de histórico duplicado e o e-mail de aprovado saindo duas vezes. Agora só o
  // primeiro escreve, e o segundo recebe 409.
  const avanco = await avancarEtapa({
    requestId: request.id,
    de: "APROVACAO",
    para: nextStage,
  });
  if (!avanco.ok) {
    return NextResponse.json({ error: avanco.erro }, { status: avanco.status });
  }

  const { subject, html } = templates.aprovado(request.requester.name, request.shortDescription);
  await sendPurchaseEmail({ to: request.requester.email, subject, html, requestId: request.id });

  return NextResponse.json(avanco.solicitacao);
}
