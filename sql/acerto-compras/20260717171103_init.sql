-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('SOLICITANTE', 'COMPRADOR', 'APROVADOR', 'JURIDICO', 'TESOURARIA', 'CONTROLADORIA', 'PRIVACIDADE', 'FISCAL', 'ADMIN');

-- CreateEnum
CREATE TYPE "Diretoria" AS ENUM ('CORPORATIVO', 'REVENUE', 'TECNOLOGIA');

-- CreateEnum
CREATE TYPE "RiskTier" AS ENUM ('BAIXO', 'MEDIO', 'ALTO');

-- CreateEnum
CREATE TYPE "ScreeningStatus" AS ENUM ('PENDENTE', 'APROVADO', 'REPROVADO');

-- CreateEnum
CREATE TYPE "DemandType" AS ENUM ('COMPRA_PRODUTO', 'COMPRA_SERVICO', 'FERRAMENTA_NOVA', 'FERRAMENTA_USUARIOS', 'RENOVACAO_CONTRATO', 'CANCELAMENTO');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('BAIXA', 'MEDIA', 'ALTA');

-- CreateEnum
CREATE TYPE "ValueType" AS ENUM ('FIXO', 'VARIAVEL');

-- CreateEnum
CREATE TYPE "Lane" AS ENUM ('FAST', 'STANDARD', 'STRATEGIC');

-- CreateEnum
CREATE TYPE "Stage" AS ENUM ('SOLICITACAO', 'TRIAGEM', 'VALIDACAO_ORCAMENTARIA', 'DUE_DILIGENCE', 'COTACAO', 'MAPA_COTACAO', 'APROVACAO', 'JURIDICO', 'PEDIDO_COMPRA', 'AGUARDANDO_ENTREGA', 'MEDICAO', 'FISCAL', 'TESOURARIA', 'MAPEAMENTO_CONTRATO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('PENDENTE', 'APROVADO', 'REPROVADO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "googleId" TEXT,
    "diretoria" "Diretoria",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "RoleName" NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCenter" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetLine" (
    "id" TEXT NOT NULL,
    "externalCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "monthRef" TEXT NOT NULL,
    "available" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "tradeName" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "riskTier" "RiskTier" NOT NULL DEFAULT 'MEDIO',
    "approvedVendor" BOOLEAN NOT NULL DEFAULT false,
    "screeningStatus" "ScreeningStatus" NOT NULL DEFAULT 'PENDENTE',
    "screeningNotes" TEXT,
    "screenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConflictOfInterestDeclaration" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "declaredBy" TEXT NOT NULL,
    "hasConflict" BOOLEAN NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConflictOfInterestDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequest" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "buyerId" TEXT,
    "diretoria" "Diretoria" NOT NULL,
    "costCenterId" TEXT NOT NULL,
    "approverManagerId" TEXT NOT NULL,
    "budgetLineId" TEXT,
    "priority" "Priority" NOT NULL,
    "demandType" "DemandType" NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "longDescription" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "estimatedValue" DECIMAL(14,2) NOT NULL,
    "needsContract" BOOLEAN,
    "needsMapping" BOOLEAN,
    "valueType" "ValueType",
    "lane" "Lane",
    "fragmentationFlag" BOOLEAN NOT NULL DEFAULT false,
    "currentStage" "Stage" NOT NULL DEFAULT 'SOLICITACAO',
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "cancelReason" TEXT,
    "slaDeadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fromStage" "Stage",
    "toStage" "Stage" NOT NULL,
    "actorId" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "stage" "Stage" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "stage" "Stage" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetException" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "decision" "ApprovalDecision" NOT NULL DEFAULT 'PENDENTE',
    "justification" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "BudgetException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DueDiligenceReview" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "approved" BOOLEAN,
    "justification" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "DueDiligenceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "supplierId" TEXT,
    "supplierName" TEXT NOT NULL,
    "initialValue" DECIMAL(14,2) NOT NULL,
    "negotiatedValue" DECIMAL(14,2) NOT NULL,
    "paymentCondition" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "approverId" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL DEFAULT 'PENDENTE',
    "justification" TEXT,
    "personifiedBy" TEXT,
    "dueAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalReview" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "minutaUrl" TEXT,
    "signedDocUrl" TEXT,
    "signed" BOOLEAN,
    "observations" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "LegalReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "supplierId" TEXT,
    "supplierLegalName" TEXT NOT NULL,
    "supplierCnpj" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "initialValue" DECIMAL(14,2) NOT NULL,
    "negotiatedValue" DECIMAL(14,2) NOT NULL,
    "paymentCondition" TEXT NOT NULL,
    "installments" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "sentToSupplier" BOOLEAN NOT NULL DEFAULT false,
    "needsMeasurement" BOOLEAN NOT NULL DEFAULT false,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "supplierId" TEXT,
    "supplierName" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "terminationClause" TEXT,
    "renewalDate" TIMESTAMP(3) NOT NULL,
    "contractManagerId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "costCenter" TEXT NOT NULL,
    "nonCompete" BOOLEAN NOT NULL DEFAULT false,
    "lgpdClause" BOOLEAN NOT NULL DEFAULT false,
    "brandUse" BOOLEAN NOT NULL DEFAULT false,
    "corporateChangeClause" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "treasuryNotifiedOnCancel" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractAlert" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" TEXT NOT NULL,
    "newRequestOpened" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ContractAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Measurement" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "scopeExecuted" TEXT NOT NULL,
    "quantities" TEXT,
    "contractRef" TEXT,
    "technicalApproval" "ApprovalDecision" NOT NULL DEFAULT 'PENDENTE',
    "reviewComment" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "Measurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalDocument" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "documentUrl" TEXT NOT NULL,
    "approved" BOOLEAN,
    "reviewComment" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "FiscalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3),
    "paidDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PROGRAMADO',
    "erpConfirmed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierEvaluation" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "score" INTEGER,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ENVIADO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_role_key" ON "UserRole"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_name_key" ON "CostCenter"("name");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetLine_externalCode_key" ON "BudgetLine"("externalCode");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_cnpj_key" ON "Supplier"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequest_code_key" ON "PurchaseRequest"("code");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetException_requestId_key" ON "BudgetException"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "DueDiligenceReview_requestId_key" ON "DueDiligenceReview"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "LegalReview_requestId_key" ON "LegalReview"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_requestId_key" ON "PurchaseOrder"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_requestId_key" ON "Contract"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "Measurement_requestId_key" ON "Measurement"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalDocument_requestId_key" ON "FiscalDocument"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_requestId_key" ON "Payment"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierEvaluation_requestId_key" ON "SupplierEvaluation"("requestId");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflictOfInterestDeclaration" ADD CONSTRAINT "ConflictOfInterestDeclaration_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_approverManagerId_fkey" FOREIGN KEY ("approverManagerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_budgetLineId_fkey" FOREIGN KEY ("budgetLineId") REFERENCES "BudgetLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageEvent" ADD CONSTRAINT "StageEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageEvent" ADD CONSTRAINT "StageEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetException" ADD CONSTRAINT "BudgetException_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DueDiligenceReview" ADD CONSTRAINT "DueDiligenceReview_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalReview" ADD CONSTRAINT "LegalReview_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_contractManagerId_fkey" FOREIGN KEY ("contractManagerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAlert" ADD CONSTRAINT "ContractAlert_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierEvaluation" ADD CONSTRAINT "SupplierEvaluation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PurchaseRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
