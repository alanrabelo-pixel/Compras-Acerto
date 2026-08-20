import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { nextAfterAprovacaoGestor } from "@/lib/workflow";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";
import { requireRole } from "@/lib/rbac";
import { checarComprovanteDoFpa } from "@/lib/orcamento-extra";
import { logger } from "@/lib/logger";
import { avancarEtapa, notificarAvancoDeEtapa } from "@/lib/etapa";
import { USUARIO_PUBLICO } from "@/lib/usuario";

/**
 * PATCH /api/requests/[id]/aprovacao-gestor
 *
 * Decisão do gestor do centro de custo (CostCenter.managers, ver
 * /admin/centros-de-custo) logo após o envio do formulário. Pedido do
 * usuário: aprovação automática direcionada ao(s) gestor(es) de cada centro
 * de custo, antes de qualquer ação do comprador. Se aprovado, segue
 * normalmente para Homologação e Triagem; se reprovado, cancela.
 *
 * Autorização: quando o centro de custo tem gestor(es) configurado(s),
 * qualquer um deles pode decidir (mais de um é permitido, pedido do usuário,
 * o que reduz a necessidade de reajuste manual quando o titular está ausente).
 * Sem gestor configurado, cai no fallback antigo (qualquer APROVADOR).
 * `personifiedBy`: um ADMIN pode decidir em nome do gestor pré-definido "a
 * qualquer momento, sempre que julgar necessário" (pedido do usuário), sem
 * o teto de alçada que existe para a personificação do comprador em
 * .../aprovacao.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { actorId, decision, justification, personifiedBy } = body;

  if (!["APROVADO", "REPROVADO"].includes(decision)) {
    return NextResponse.json({ error: "Decisão inválida. Escolha aprovar ou reprovar." }, { status: 400 });
  }

  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: {
      requester: { select: USUARIO_PUBLICO },
      costCenter: { include: { managers: { select: USUARIO_PUBLICO } } },
    },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "APROVACAO_GESTOR") {
    return NextResponse.json(
      { error: "Esta solicitação não está na etapa de Aprovação do Gestor. Recarregue a página para ver o estado atual." },
      { status: 409 }
    );
  }

  if (personifiedBy) {
    const roleError = await requireRole(personifiedBy, ["ADMIN"]);
    if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });
    if (!actorId) return NextResponse.json({ error: "actorId obrigatório ao personificar (a quem a decisão é atribuída)." }, { status: 400 });
  } else {
    const pool = request.costCenter.managers;
    if (pool.length > 0) {
      if (!pool.some((m) => m.id === actorId)) {
        return NextResponse.json({ error: "Este usuário não é um dos gestores aprovadores deste centro de custo." }, { status: 403 });
      }
    } else {
      const roleError = await requireRole(actorId, ["APROVADOR"]);
      if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });
    }
  }

  if (decision === "REPROVADO" && !justification) {
    return NextResponse.json({ error: "Justificativa é obrigatória para reprovar." }, { status: 422 });
  }

  const approved = decision === "APROVADO";

  // Porta de saída do Orçamento Extra sem comprovante do FP&A.
  //
  // A criação da solicitação (POST /api/requests) aceita extraBudget=true sem
  // anexo nenhum, e não tem como ser diferente: o arquivo só é enviável depois
  // que a solicitação existe (o formulário faz create e só então
  // uploadIfPresent, ver NovaSolicitacaoForm). Esta é a PRIMEIRA transição
  // depois da criação, ou seja, o primeiro momento em que dá para cobrar o
  // documento sem quebrar o formulário. Cobrar só na Validação Orçamentária
  // deixava a solicitação circular por Aprovação do Gestor e Triagem sem ele,
  // e o atalho de CANCELAMENTO na Triagem (que vai direto para o Jurídico)
  // pulava a Validação Orçamentária inteira.
  //
  // Vale também para o ADMIN que personifica o gestor: a personificação é
  // sobre QUEM decide, não sobre exigir ou não o documento.
  //
  // Só bloqueia a aprovação. Reprovar continua livre: recusar uma compra não
  // depende de documento nenhum, e travar a recusa deixaria a solicitação sem
  // saída quando o comprovante nunca vier.
  if (approved) {
    const checagem = await checarComprovanteDoFpa(request, "antes de aprovar a solicitação");
    if (!checagem.ok) {
      return NextResponse.json({ error: checagem.erro }, { status: 422 });
    }
  }

  const nextStage = nextAfterAprovacaoGestor({ approved });

  // Os cinco campos da decisão do gestor vão na MESMA transação do avanço.
  // Antes eram um update solto seguido do evento: uma falha entre os dois
  // deixava a decisão gravada sem registro de quem a tomou e quando.
  const avanco = await avancarEtapa({
    requestId: request.id,
    de: "APROVACAO_GESTOR",
    para: nextStage,
    actorId,
    comentario: justification || null,
    dadosExtras: {
      managerApprovalDecision: decision,
      managerApprovalActorId: actorId,
      managerApprovalJustification: justification ?? null,
      managerApprovalDecidedAt: new Date(),
      managerApprovalPersonifiedBy: personifiedBy ?? null,
      ...(approved ? {} : { status: "CANCELADO", cancelReason: justification }),
    },
  });
  if (!avanco.ok) {
    return NextResponse.json({ error: avanco.erro }, { status: avanco.status });
  }
  const updated = avanco.solicitacao;

  if (!approved) {
    const { subject, html } = templates.reprovado(request.requester.name, request.shortDescription, justification);
    await sendPurchaseEmail({ to: request.requester.email, subject, html, requestId: request.id }).catch((erro) => {
      logger.warn("email_reprovacao_gestor_falhou", { solicitacao: request.code, erro });
    });
  } else {
    // Esta etapa avisava só quando reprovava. Era a única do fluxo assim: em
    // todas as outras o solicitante fica sabendo que avançou. Quem passava
    // pela aprovação do gestor ficava no escuro justamente no momento em que
    // a solicitação foi liberada para seguir.
    await notificarAvancoDeEtapa(updated, nextStage);
  }

  return NextResponse.json(updated);
}
