import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ContractActions } from "@/components/ContractActions";
import { AttachmentsPanel } from "@/components/AttachmentsPanel";
import { formatDateOnly, formatDateTime } from "@/lib/format";
import { AppShell } from "@/components/AppShell";
import { Breadcrumb, Badge } from "@/components/ui";
import { CONTRACT_STATUS_BADGE_VARIANT } from "@/lib/badge-variants";
import { CONTRACT_STATUS_LABEL, rotulo } from "@/lib/rotulos";
import { USUARIO_PUBLICO } from "@/lib/usuario";

export const dynamic = "force-dynamic";

function monthsBetween(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
}

function daysUntil(date: Date) {
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p style={{ margin: 0 }}>
      <span className="text-muted">{label}:</span> {children}
    </p>
  );
}

const EMPTY = <span style={{ color: "var(--ink-muted)", fontStyle: "italic" }}>Preencher manualmente</span>;

// O canal era renderizado cru na tela, então a pessoa lia "EMAIL_E_SLACK".
const CANAL_DO_ALERTA: Record<string, string> = {
  EMAIL: "E-mail",
  SLACK: "Slack",
  EMAIL_E_SLACK: "E-mail e Slack",
};

export default async function ContractDetailPage({ params }: { params: { id: string } }) {
  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    include: { contractManager: { select: USUARIO_PUBLICO }, alerts: { orderBy: { sentAt: "desc" } }, request: true },
  });
  if (!contract) notFound();

  // Quem está logado, para o painel de anexo mostrar o nome real em vez de um
  // seletor: a rota de upload grava o autor a partir da sessão, então escolher
  // outra pessoa na tela não teria efeito nenhum. Sem SSO real fica null e o
  // seletor volta, como em desenvolvimento.
  const sessao = await getServerSession(authOptions);
  const quemEstaLogado = sessao?.user?.email
    ? await prisma.user.findUnique({
        where: { email: sessao.user.email },
        select: { id: true, name: true, email: true },
      })
    : null;

  // Contrato assinado: reaproveita o mecanismo de Attachment da solicitação
  // de origem (ver AttachmentCategory.CONTRATO_ASSINADO no schema), em vez de
  // uma tabela/armazenamento próprio. Attachment exige requestId, então
  // contratos legados importados via planilha (sem solicitação de origem)
  // não têm esse anexo disponível ainda.
  const signedContractFiles = contract.requestId
    ? await prisma.attachment.findMany({
        where: { requestId: contract.requestId, category: "CONTRATO_ASSINADO" },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const vigenciaMeses = monthsBetween(contract.startDate, contract.endDate);
  const diasFaltantes = daysUntil(contract.renewalDate);

  return (
    <AppShell active="/contratos">
      <main className="page-narrow" style={{ paddingTop: 28 }}>
        <Breadcrumb items={[{ label: "Contratos", href: "/contratos" }, { label: contract.supplierName }]} />

        <div className="contract-hero">
          <div>
            <p className="contract-hero-eyebrow">{contract.area} · {contract.costCenter}</p>
            <h1 className="contract-hero-title">{contract.supplierName}</h1>
            <p className="contract-hero-subtitle">{contract.supplierTradeName ?? "Nome fantasia não informado"}</p>
          </div>
          <Badge variant={CONTRACT_STATUS_BADGE_VARIANT[contract.status] ?? "neutral"}>{rotulo(CONTRACT_STATUS_LABEL, contract.status)}</Badge>
        </div>

        {/* O que mais importa num contrato ativo (quanto tempo falta e desde
            quando) merece destaque logo abaixo do cabeçalho, não enterrado
            como só mais um campo entre 6 cards de identidade/financeiro. */}
        <div className="contract-renewal-strip">
          <div className="contract-renewal-cell">
            <span className={`contract-renewal-value${diasFaltantes < 0 ? " contract-renewal-value-danger" : diasFaltantes <= 30 ? " contract-renewal-value-warning" : ""}`}>
              {diasFaltantes < 0 ? `Vencido há ${Math.abs(diasFaltantes)}d` : `${diasFaltantes} dias`}
            </span>
            <span className="contract-renewal-label">{diasFaltantes < 0 ? "Vencido" : "Até o vencimento"}</span>
          </div>
          <div className="contract-renewal-cell">
            <span className="contract-renewal-value">{formatDateOnly(contract.renewalDate)}</span>
            <span className="contract-renewal-label">Renovação prevista</span>
          </div>
          <div className="contract-renewal-cell">
            <span className="contract-renewal-value">{vigenciaMeses} meses</span>
            <span className="contract-renewal-label">Vigência total</span>
          </div>
        </div>

        {contract.requestId ? (
          <AttachmentsPanel
            requestId={contract.requestId}
            attachments={signedContractFiles.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }))}
            uploaderId={contract.contractManagerId}
            sessionActor={quemEstaLogado}
            category="CONTRATO_ASSINADO"
            title="Contrato Assinado"
            emptyLabel="Nenhum contrato assinado anexado ainda. Anexe o PDF assinado abaixo."
          />
        ) : (
          <section className="card section-gap">
            <h2 className="card-title">Contrato Assinado</h2>
            <p style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
              Contrato importado de planilha (sem solicitação de origem): anexo de contrato assinado ainda não
              disponível para este tipo de registro.
            </p>
          </section>
        )}

        <section className="card section-gap">
          <h2 className="card-title">Identificação</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", fontSize: 12.5 }}>
            <Field label="Razão Social">{contract.supplierName}</Field>
            <Field label="Nome Fantasia">{contract.supplierTradeName ?? EMPTY}</Field>
            <Field label="CNPJ">{contract.supplierCnpj ?? EMPTY}</Field>
            <Field label="Tipo de Documento">{contract.documentType ?? EMPTY}</Field>
          </div>
          <hr className="divider" />
          <Field label="Objeto do Contrato">{contract.contractObject ?? EMPTY}</Field>
        </section>

        <section className="card section-gap">
          <h2 className="card-title">Vigência</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", fontSize: 12.5 }}>
            <Field label="Início da Vigência">{formatDateOnly(contract.startDate)}</Field>
            <Field label="Fim da Vigência">{formatDateOnly(contract.endDate)}</Field>
            <Field label="Prazo">{contract.prazo ?? EMPTY}</Field>
            <Field label="Vigência (meses)">{vigenciaMeses} meses</Field>
          </div>
        </section>

        <section className="card section-gap">
          <h2 className="card-title">Financeiro e Cláusulas</h2>
          <Field label="Condição de Pagamento">{contract.paymentCondition ?? EMPTY}</Field>
          <hr className="divider" />
          <Field label="Cláusula de Renovação e Rescisão">{contract.terminationClause ?? EMPTY}</Field>
          {(contract.nonCompete || contract.lgpdClause || contract.brandUse || contract.corporateChangeClause) && (
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              {contract.nonCompete && <Badge variant="neutral">Não-concorrência</Badge>}
              {contract.lgpdClause && <Badge variant="neutral">LGPD</Badge>}
              {contract.brandUse && <Badge variant="neutral">Uso de marca</Badge>}
              {contract.corporateChangeClause && <Badge variant="neutral">Mudança societária</Badge>}
            </div>
          )}
        </section>

        <section className="card section-gap">
          <h2 className="card-title">Organização</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", fontSize: 12.5 }}>
            <Field label="Diretoria">{contract.request?.diretoria ?? contract.diretoria ?? EMPTY}</Field>
            <Field label="Centro de Custo">{contract.costCenter}</Field>
            <Field label="Gestor Responsável">{contract.contractManager.name}</Field>
            <Field label="E-mail do Gestor">{contract.contractManager.email}</Field>
            <Field label="Solicitação de origem">
              {contract.request ? <a href={`/solicitacoes/${contract.request.id}`} style={{ color: "var(--acerto-green-dark)", fontWeight: 600 }}>{contract.request.code}</a> : "-"}
            </Field>
            <Field label="Alerta Enviado">{contract.alerts.length > 0 ? `Sim (${formatDateOnly(contract.alerts[0].sentAt)})` : "Não"}</Field>
          </div>
        </section>

        {/* status cru, não o rótulo. A varredura de rótulos legíveis passou aqui
            e traduziu este valor junto, mas ele não é texto de tela: o
            componente compara com "CANCELADO" para esconder o formulário. Com
            "Cancelado" traduzido, a comparação falhava e um contrato já
            cancelado voltava a oferecer o botão de cancelar, que reenviava
            e-mail e Slack para a Tesouraria inteira. */}
        <ContractActions contractId={contract.id} status={contract.status} />

        <section className="card section-gap">
          <h2 className="card-title">Alertas de renovação enviados</h2>
          {contract.alerts.length === 0 && <p style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Nenhum alerta enviado ainda. O aviso de renovação sai automaticamente 3 meses antes do vencimento.</p>}
          {contract.alerts.map((a) => (
            <div key={a.id} className="timeline-item">
              <span className="timeline-dot" />
              <span>{CANAL_DO_ALERTA[a.channel] ?? a.channel} · {formatDateTime(a.sentAt)}</span>
            </div>
          ))}
        </section>
      </main>
    </AppShell>
  );
}
