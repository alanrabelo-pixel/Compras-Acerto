import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { STAGES, expectativaDaEtapa } from "@/lib/workflow";
import { RequestActions } from "@/components/RequestActions";
import { AttachmentsPanel } from "@/components/AttachmentsPanel";
import { RequestChatWidget } from "@/components/RequestChatWidget";
import { HistoryTimeline } from "@/components/HistoryTimeline";
import { StageOverrideControls } from "@/components/StageOverrideControls";
import { formatDateOnly, formatCurrency } from "@/lib/format";
import { AppShell } from "@/components/AppShell";
import { Breadcrumb, Badge, WarningNotice } from "@/components/ui";
import { PRIORITY_BADGE_VARIANT } from "@/lib/badge-variants";
import { PRIORITY_LABEL, DEMAND_TYPE_LABEL, rotulo } from "@/lib/rotulos";
import {
  checarComprovanteDoFpa,
  CATEGORIA_COMPROVANTE_FPA,
  BASE_DE_ORCAMENTO_EXTRA_LABEL,
  IMPACTO_DE_ORCAMENTO_EXTRA_LABEL,
} from "@/lib/orcamento-extra";
import { USUARIO_PUBLICO, USUARIO_RESUMIDO } from "@/lib/usuario";

export const dynamic = "force-dynamic";

export default async function RequestDetailPage({ params }: { params: { id: string } }) {
  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: {
      requester: { select: USUARIO_PUBLICO },
      approverManager: { select: USUARIO_PUBLICO },
      buyer: { select: USUARIO_PUBLICO },
      costCenter: { include: { managers: { select: USUARIO_PUBLICO } } },
      budgetLine: true,
      budgetException: { include: { attachment: true } },
      dueDiligence: true,
      conflictDeclarations: { orderBy: { createdAt: "desc" } },
      quotes: { orderBy: { createdAt: "asc" } },
      approvals: { include: { approver: { select: USUARIO_PUBLICO } } },
      legalReview: true,
      purchaseOrder: { include: { items: { orderBy: { order: "asc" } }, supplier: true } },
      measurement: true,
      fiscalDocument: true,
      payment: true,
      contract: true,
      supplierEvaluation: true,
      attachments: { orderBy: { createdAt: "desc" } },
      stageEvents: { orderBy: { createdAt: "asc" }, include: { actor: { select: USUARIO_PUBLICO } } },
      comments: { include: { author: { select: USUARIO_PUBLICO } }, orderBy: { createdAt: "desc" } },
    },
  });

  if (!request) notFound();

  // Identidade de quem está logado (mesmo padrão de solicitacoes/nova/page.tsx),
  // repassada para RequestActions para autopreencher/travar os campos de
  // "responsável" em cada etapa quando o SSO real estiver ligado. Sem sessão
  // real (LOCAL_BYPASS_AUTH, ver .env), fica null e os seletores manuais
  // continuam aparecendo, como antes.
  const session = await getServerSession(authOptions);
  const sessionActorRaw = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, name: true, email: true, roles: { select: { role: true } } },
      })
    : null;
  // isAdmin: pedido do usuário. O Administrador do sistema pode personificar
  // um aprovador pré-definido (gestor de centro de custo, aprovador de
  // alçada) sempre que julgar necessário, mesmo com SSO real ligado (ver
  // ActorField/allowAdminOverride em RequestActions.tsx).
  const sessionActor = sessionActorRaw
    ? { id: sessionActorRaw.id, name: sessionActorRaw.name, email: sessionActorRaw.email, isAdmin: sessionActorRaw.roles.some((r) => r.role === "ADMIN") }
    : null;

  // ConflictOfInterestDeclaration.declaredBy guarda o id do usuário (via
  // UserPicker em RequestActions), sem relação FK no schema, por isso resolvemos
  // o nome aqui para exibição no Histórico, em vez do id cru.
  const declaredByIds = [
    ...request.conflictDeclarations.map((c) => c.declaredBy),
    ...(request.managerApprovalActorId ? [request.managerApprovalActorId] : []),
  ];
  const declaredByUsers = declaredByIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: declaredByIds } }, select: USUARIO_RESUMIDO })
    : [];
  const declaredByNames = Object.fromEntries(declaredByUsers.map((u) => [u.id, u.name]));

  const expectativaDaEtapaAtual = expectativaDaEtapa(request.currentStage, request.diretoria);

  // Extra-orçamentária: a tela não dizia nem que a solicitação foi aberta sem
  // linha de orçamento, nem que falta o comprovante do FP&A. O gestor só
  // descobria clicando em aprovar e tomando um 422 de uma regra que ninguém
  // tinha mostrado a ele. A checagem é a MESMA das portas de saída
  // (src/lib/orcamento-extra.ts), chamada aqui de propósito: se a regra mudar,
  // o que a tela avisa e o que a API cobra mudam juntos.
  //
  // Também não havia caminho para resolver: o painel "Anexos" genérico envia
  // sem categoria (vira GERAL, ver POST /api/requests/[id]/attachments), e a
  // única tela que gravava APROVACAO_EXTRA_ORCAMENTARIA era o formulário de
  // abertura. Quem não anexou na criação ficava sem lugar para anexar depois.
  // Daí o painel dedicado abaixo, mesmo padrão do painel de triagem.
  const checagemDoComprovante = await checarComprovanteDoFpa(request, "antes de aprovar a solicitação");
  const comprovanteDoFpa = checagemDoComprovante.ok ? checagemDoComprovante.comprovante : null;
  const faltaComprovanteDoFpa = !checagemDoComprovante.ok;

  const anexosDoFpa = request.attachments.filter((a) => a.category === CATEGORIA_COMPROVANTE_FPA);
  // Mostrado também quando extraBudget é false mas o documento existe (o
  // formulário envia o anexo sempre que a pessoa escolhe um arquivo): sem
  // isso, o painel sumiria e o arquivo junto, já que ele sai de "Anexos".
  const mostrarComprovanteDoFpa = request.extraBudget || anexosDoFpa.length > 0;

  // O painel de triagem só faz sentido depois que existe um fornecedor a
  // triar: da negociação em diante, ou assim que alguém já anexou a evidência
  // (caso a solicitação tenha voltado de etapa). Separamos os anexos para o
  // mesmo arquivo não aparecer duas vezes na tela.
  const anexosDeTriagem = request.attachments.filter((a) => a.category === "TRIAGEM_FORNECEDOR");
  const outrosAnexos = request.attachments.filter(
    (a) => a.category !== "TRIAGEM_FORNECEDOR" && !(mostrarComprovanteDoFpa && a.category === CATEGORIA_COMPROVANTE_FPA)
  );
  const ETAPAS_COM_FORNECEDOR_DEFINIDO: string[] = [
    "COTACAO", "MAPA_COTACAO", "APROVACAO", "JURIDICO", "PEDIDO_COMPRA",
    "AGUARDANDO_ENTREGA", "MEDICAO", "FISCAL", "TESOURARIA",
    "MAPEAMENTO_CONTRATO", "CONCLUIDO",
  ];
  const mostrarTriagemDoFornecedor =
    anexosDeTriagem.length > 0 || ETAPAS_COM_FORNECEDOR_DEFINIDO.includes(request.currentStage);

  // Prisma Decimal não serializa através da fronteira Server → Client Component;
  // convertendo para number antes de passar para <RequestActions>.
  const serializableRequest = {
    ...request,
    estimatedValue: request.estimatedValue !== null ? Number(request.estimatedValue) : null,
    quotes: request.quotes.map((q) => ({
      ...q,
      initialValue: Number(q.initialValue),
      negotiatedValue: Number(q.negotiatedValue),
    })),
    purchaseOrder: request.purchaseOrder
      ? {
          ...request.purchaseOrder,
          initialValue: Number(request.purchaseOrder.initialValue),
          negotiatedValue: Number(request.purchaseOrder.negotiatedValue),
        }
      : null,
  };

  return (
    <AppShell active="/solicitacoes">
      <main className="page" style={{ paddingTop: 28 }}>
        <Breadcrumb items={[{ label: "Quadro", href: "/solicitacoes" }, { label: request.code }]} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 14 }}>
          <div>
            <h1 className="page-title">{request.shortDescription}</h1>
            <p className="page-subtitle">
              <span style={{ color: "var(--acerto-green-dark)", fontWeight: 700 }}>{request.code}</span> · {request.requester.name} · {request.costCenter.name}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {request.extraBudget && <Badge variant="warning">Orçamento Extra</Badge>}
            <Badge variant={PRIORITY_BADGE_VARIANT[request.priority] ?? "neutral"}>{rotulo(PRIORITY_LABEL, request.priority)}</Badge>
            <Badge variant="green">{STAGES[request.currentStage].label}</Badge>
          </div>
        </div>

        {/* Expectativa de tempo da etapa e prazo da solicitação inteira. O
            prazo total já era calculado na criação e só aparecia nos painéis
            gerenciais: quem estava esperando a própria compra não via nem um
            nem outro. */}
        {(expectativaDaEtapaAtual !== null || request.slaDeadline) && (
          <p style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 10, marginBottom: 0 }}>
            {expectativaDaEtapaAtual !== null && (
              <>
                Esta etapa costuma levar {expectativaDaEtapaAtual}{" "}
                {expectativaDaEtapaAtual === 1 ? "dia útil" : "dias úteis"}
                {request.slaDeadline ? " · " : ""}
              </>
            )}
            {request.slaDeadline && <>Previsão de conclusão da solicitação: {formatDateOnly(request.slaDeadline)}</>}
            <> · tempos de referência, não travam nada</>
          </p>
        )}

        <div style={{ marginTop: 10 }}>
          <StageOverrideControls
            requestId={request.id}
            currentStageLabel={STAGES[request.currentStage].label}
            allStageOptions={Object.values(STAGES)
              .filter((s) => s.stage !== request.currentStage)
              // CANCELADO continua na lista, que é uso legítimo do admin. Já
              // APROVACAO_GESTOR saiu do fluxo em 21/08/2026 e não tem mais
              // rota: mover uma solicitação para lá a deixaria sem nenhuma
              // ação possível, só o próprio override para tirá-la de novo.
              .filter((s) => s.stage !== "APROVACAO_GESTOR")
              .map((s) => ({ value: s.stage, label: s.label }))}
          />
        </div>

        {faltaComprovanteDoFpa && (
          <WarningNotice className="section-gap">
            <strong>Orçamento Extra sem o comprovante de aprovação do FP&amp;A.</strong> Esta solicitação foi aberta
            sem linha de orçamento, então o documento do FP&amp;A é obrigatório para ela seguir. O que fazer: pedir a
            aprovação ao FP&amp;A e anexar o arquivo no painel &quot;Comprovante de aprovação do FP&amp;A&quot; mais
            abaixo nesta página. Quem faz: o solicitante ({request.requester.name}) ou o comprador
            {request.buyer ? ` (${request.buyer.name})` : " responsável"}. Enquanto o comprovante não estiver
            anexado, a Validação Orçamentária não avança, e o atalho de cancelamento na Triagem também não.
          </WarningNotice>
        )}

        {request.fragmentationFlag && (
          <WarningNotice className="section-gap">
            Sinalizada por risco de fracionamento: a soma das compras deste fornecedor nos últimos 12 meses ultrapassa a alçada individual desta solicitação. Revisão da Controladoria recomendada.
          </WarningNotice>
        )}

        {/*
          Detalhamento do Orçamento Extra, preenchido no modal da abertura.
          Fica ACIMA do painel de Detalhes de propósito: quem abre esta tela
          para decidir a exceção (Coordenação ou Gerente F&NC, conforme a
          alçada) precisa do impacto antes dos dados operacionais da compra.
          O painel de Detalhes logo abaixo completa o quadro com prazo,
          fornecedor indicado, centro de custo e o resto.

          Só aparece quando há detalhamento gravado: solicitações abertas antes
          de 21/08/2026 são Orçamento Extra sem estes campos, e um painel com
          cinco traços não informa nada.
        */}
        {request.extraBudget && request.extraBudgetBasis && (
          <section className="card section-gap">
            <h2 className="card-title">Orçamento Extra: detalhamento do solicitante</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", fontSize: 12.5 }}>
              <p style={{ margin: 0 }}>
                <span className="text-muted">Valor solicitado:</span>{" "}
                {request.estimatedValue !== null ? formatCurrency(Number(request.estimatedValue)) : "não informado"}{" "}
                {BASE_DE_ORCAMENTO_EXTRA_LABEL[request.extraBudgetBasis]}
              </p>
              <p style={{ margin: 0 }}>
                <span className="text-muted">Impacto financeiro:</span>{" "}
                {request.extraBudgetImpact ? IMPACTO_DE_ORCAMENTO_EXTRA_LABEL[request.extraBudgetImpact] : "não informado"}
              </p>
              <p style={{ margin: 0, gridColumn: "1 / -1" }}>
                <span className="text-muted">Vigência:</span>{" "}
                {request.extraBudgetStart && request.extraBudgetEnd
                  ? `${formatDateOnly(request.extraBudgetStart)} a ${formatDateOnly(request.extraBudgetEnd)}`
                  : "não informada"}
              </p>
              <div style={{ gridColumn: "1 / -1" }}>
                <span className="text-muted">Motivo de não estar no orçamento original:</span>
                <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{request.extraBudgetJustification}</p>
              </div>
            </div>
          </section>
        )}

        <section className="card section-gap">
          <h2 className="card-title">Detalhes</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", fontSize: 12.5 }}>
            <p style={{ margin: 0 }}>
              <span className="text-muted">Valor estimado:</span>{" "}
              {request.estimatedValue !== null ? formatCurrency(Number(request.estimatedValue)) : "ainda não informado"}
            </p>
            <p style={{ margin: 0 }}><span className="text-muted">Tipo de demanda:</span> {rotulo(DEMAND_TYPE_LABEL, request.demandType)}</p>
            <p style={{ margin: 0 }}><span className="text-muted">Quantidade:</span> {request.quantity}</p>
            <p style={{ margin: 0 }}><span className="text-muted">Lane:</span> {request.lane ?? "não definida"}</p>
            <p style={{ margin: 0 }}><span className="text-muted">Gestor do centro de custo:</span> {request.approverManager?.name ?? "sem gestor definido"}</p>
            <p style={{ margin: 0 }}><span className="text-muted">Comprador:</span> {request.buyer?.name ?? "não atribuído"}</p>
            <p style={{ margin: 0 }}><span className="text-muted">Aprovado pela liderança na abertura:</span> {request.leadershipPreApproved ? "Sim" : "Não"}</p>
            {request.extraBudget && (
              <p style={{ margin: 0 }}>
                <span className="text-muted">Orçamento Extra:</span>{" "}
                {comprovanteDoFpa
                  ? `Sim, com comprovante do FP&A anexado (${comprovanteDoFpa.fileName})`
                  : "Sim, comprovante do FP&A pendente"}
              </p>
            )}
            <p style={{ margin: 0 }}><span className="text-muted">Data limite sugerida (solicitante):</span> {formatDateOnly(request.suggestedDeadline)}</p>
          </div>
          <hr className="divider" />
          <p style={{ fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>{request.longDescription}</p>
          {request.indicatedSupplierName && (
            <p style={{ fontSize: 12.5, marginTop: 10 }}>
              <span className="text-muted">Fornecedor indicado:</span> {request.indicatedSupplierName}
              {request.indicatedSupplierPhone ? ` · ${request.indicatedSupplierPhone}` : ""}
              {request.indicatedSupplierEmail ? ` · ${request.indicatedSupplierEmail}` : ""}
              {request.indicatedSupplierWebsite ? ` · ${request.indicatedSupplierWebsite}` : ""}
            </p>
          )}
          {request.affectedUsers && (
            <p style={{ fontSize: 12.5, marginTop: 10 }}><span className="text-muted">Usuários afetados:</span> {request.affectedUsers}</p>
          )}
        </section>

        <RequestActions request={serializableRequest} sessionActor={sessionActor} declaredByNames={declaredByNames} />

        {/* Comprovante de aprovação do FP&A: painel próprio porque este anexo
            tem categoria própria (é ele que as portas de saída procuram, ver
            @/lib/orcamento-extra) e o painel genérico de Anexos grava tudo
            como GERAL, que não conta para a regra. */}
        {mostrarComprovanteDoFpa && (
          <AttachmentsPanel
            requestId={request.id}
            attachments={anexosDoFpa.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }))}
            uploaderId={request.requesterId}
            sessionActor={sessionActor}
            category={CATEGORIA_COMPROVANTE_FPA}
            title="Comprovante de aprovação do FP&A"
            emptyLabel="Nenhum comprovante anexado. Esta compra é extra-orçamentária: anexe aqui a aprovação do FP&A. Sem este arquivo, o gestor não consegue aprovar e a Validação Orçamentária não avança."
          />
        )}

        {/* Triagem do fornecedor: a verificação (CNPJ ativo, listas restritivas)
            é feita fora do sistema pelo comprador. O painel serve só para a
            evidência ficar junto da solicitação; não é obrigatório e não
            bloqueia o Pedido de Compra. Aparece a partir da etapa em que o
            fornecedor já foi escolhido, para não poluir as etapas iniciais. */}
        {mostrarTriagemDoFornecedor && (
          <AttachmentsPanel
            requestId={request.id}
            attachments={anexosDeTriagem.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }))}
            uploaderId={request.buyerId ?? request.requesterId}
            sessionActor={sessionActor}
            category="TRIAGEM_FORNECEDOR"
            title="Triagem do fornecedor (opcional)"
            emptyLabel="Nenhuma evidência anexada. Se você já verificou CNPJ e listas restritivas, anexe o comprovante aqui. O envio não é obrigatório."
          />
        )}

        <AttachmentsPanel
          requestId={request.id}
          attachments={outrosAnexos.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }))}
          uploaderId={request.buyerId ?? request.requesterId}
            sessionActor={sessionActor}
        />

        <HistoryTimeline stageEvents={request.stageEvents} request={serializableRequest} declaredByNames={declaredByNames} />
      </main>

      <RequestChatWidget requestId={request.id} requesterName={request.requester.name} buyerName={request.buyer?.name ?? null} />
    </AppShell>
  );
}
