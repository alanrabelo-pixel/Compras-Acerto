import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { ContractActions } from "@/components/ContractActions";
import { AttachmentsPanel } from "@/components/AttachmentsPanel";
import { formatDateOnly } from "@/lib/format";
import { AppShell } from "@/components/AppShell";
import { Breadcrumb } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  ATIVO: "badge-green",
  RENOVACAO_EM_ANDAMENTO: "badge-warning",
  CANCELADO: "badge-danger",
};

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

const EMPTY = <span style={{ color: "var(--ink-muted)", fontStyle: "italic" }}>— preencher manualmente</span>;

export default async function ContractDetailPage({ params }: { params: { id: string } }) {
  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    include: { contractManager: true, alerts: { orderBy: { sentAt: "desc" } }, request: true },
  });
  if (!contract) notFound();

  // Contrato assinado — reaproveita o mecanismo de Attachment da solicitação
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
  const alertaVencimento =
    diasFaltantes < 0
      ? { label: `Vencido há ${Math.abs(diasFaltantes)} dia(s)`, badge: "badge-danger" }
      : diasFaltantes <= 30
      ? { label: `Vence em ${diasFaltantes} dia(s)`, badge: "badge-warning" }
      : { label: `Normal (${diasFaltantes} dias)`, badge: "badge-green" };

  return (
    <AppShell active="/contratos">
      <main className="page-narrow" style={{ paddingTop: 28 }}>
        <Breadcrumb items={[{ label: "Contratos", href: "/contratos" }, { label: contract.supplierName }]} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 14 }}>
          <div>
            <h1 className="page-title">{contract.supplierName}</h1>
            <p className="page-subtitle">{contract.supplierTradeName ?? "Nome fantasia não informado"} · {contract.area} · {contract.costCenter}</p>
          </div>
          <span className={`badge ${STATUS_BADGE[contract.status] ?? "badge-neutral"}`}>{contract.status}</span>
        </div>

        {contract.requestId ? (
          <AttachmentsPanel
            requestId={contract.requestId}
            attachments={signedContractFiles.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }))}
            uploaderId={contract.contractManagerId}
            category="CONTRATO_ASSINADO"
            title="Contrato Assinado"
            emptyLabel="Nenhum contrato assinado anexado ainda — anexe o PDF assinado abaixo."
          />
        ) : (
          <section className="card section-gap">
            <h2 className="card-title">Contrato Assinado</h2>
            <p style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
              Contrato importado de planilha (sem solicitação de origem) — anexo de contrato assinado ainda não
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
            <Field label="Renovação prevista">{formatDateOnly(contract.renewalDate)}</Field>
            <Field label="Dias Faltantes">{diasFaltantes < 0 ? `${Math.abs(diasFaltantes)} dias (vencido)` : `${diasFaltantes} dias`}</Field>
          </div>
          <div style={{ marginTop: 10 }}>
            <span className={`badge ${alertaVencimento.badge}`}>⏰ {alertaVencimento.label}</span>
          </div>
        </section>

        <section className="card section-gap">
          <h2 className="card-title">Financeiro e Cláusulas</h2>
          <Field label="Condição de Pagamento">{contract.paymentCondition ?? EMPTY}</Field>
          <hr className="divider" />
          <Field label="Cláusula de Renovação e Rescisão">{contract.terminationClause ?? EMPTY}</Field>
          {(contract.nonCompete || contract.lgpdClause || contract.brandUse || contract.corporateChangeClause) && (
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              {contract.nonCompete && <span className="badge badge-neutral">Não-concorrência</span>}
              {contract.lgpdClause && <span className="badge badge-neutral">LGPD</span>}
              {contract.brandUse && <span className="badge badge-neutral">Uso de marca</span>}
              {contract.corporateChangeClause && <span className="badge badge-neutral">Mudança societária</span>}
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
              {contract.request ? <a href={`/solicitacoes/${contract.request.id}`} style={{ color: "var(--acerto-green-dark)", fontWeight: 600 }}>{contract.request.code}</a> : "—"}
            </Field>
            <Field label="Alerta Enviado">{contract.alerts.length > 0 ? `Sim (${formatDateOnly(contract.alerts[0].sentAt)})` : "Não"}</Field>
          </div>
        </section>

        <ContractActions contractId={contract.id} status={contract.status} />

        <section className="card section-gap">
          <h2 className="card-title">Alertas de renovação enviados</h2>
          {contract.alerts.length === 0 && <p style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Nenhum alerta enviado ainda.</p>}
          {contract.alerts.map((a) => (
            <div key={a.id} className="timeline-item">
              <span className="timeline-dot" />
              <span>{a.channel} · {new Date(a.sentAt).toLocaleString("pt-BR")}</span>
            </div>
          ))}
        </section>
      </main>
    </AppShell>
  );
}
