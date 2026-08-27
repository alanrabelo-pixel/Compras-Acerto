-- CreateTable
CREATE TABLE IF NOT EXISTS "CodeCounter" (
    "prefix" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CodeCounter_pkey" PRIMARY KEY ("prefix")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiInsight_requestId_idx" ON "AiInsight"("requestId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Announcement_createdAt_idx" ON "Announcement"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Approval_requestId_level_idx" ON "Approval"("requestId", "level");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Approval_decision_dueAt_escalatedAt_idx" ON "Approval"("decision", "dueAt", "escalatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Attachment_requestId_category_idx" ON "Attachment"("requestId", "category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Attachment_ticketId_idx" ON "Attachment"("ticketId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BudgetException_requestId_idx" ON "BudgetException"("requestId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Comment_requestId_idx" ON "Comment"("requestId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ConflictOfInterestDeclaration_requestId_idx" ON "ConflictOfInterestDeclaration"("requestId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Contract_status_renewalDate_idx" ON "Contract"("status", "renewalDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Contract_contractManagerId_idx" ON "Contract"("contractManagerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Contract_supplierId_idx" ON "Contract"("supplierId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ContractAlert_contractId_idx" ON "ContractAlert"("contractId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DueDiligenceReview_requestId_idx" ON "DueDiligenceReview"("requestId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FiscalDocument_requestId_idx" ON "FiscalDocument"("requestId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LegalReview_requestId_idx" ON "LegalReview"("requestId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Measurement_requestId_idx" ON "Measurement"("requestId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_requestId_idx" ON "Notification"("requestId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Payment_requestId_idx" ON "Payment"("requestId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseOrder_createdAt_idx" ON "PurchaseOrder"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseOrder_supplierCnpj_idx" ON "PurchaseOrder"("supplierCnpj");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseRequest_currentStage_idx" ON "PurchaseRequest"("currentStage");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseRequest_createdAt_idx" ON "PurchaseRequest"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseRequest_updatedAt_idx" ON "PurchaseRequest"("updatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseRequest_requesterId_idx" ON "PurchaseRequest"("requesterId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseRequest_buyerId_idx" ON "PurchaseRequest"("buyerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseRequest_costCenterId_idx" ON "PurchaseRequest"("costCenterId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseRequest_status_idx" ON "PurchaseRequest"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseRequest_demandType_idx" ON "PurchaseRequest"("demandType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseRequest_diretoria_idx" ON "PurchaseRequest"("diretoria");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseRequest_erpSyncedAt_idx" ON "PurchaseRequest"("erpSyncedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Quote_requestId_idx" ON "Quote"("requestId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Quote_supplierId_idx" ON "Quote"("supplierId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RequestChatMessage_slackThreadTs_idx" ON "RequestChatMessage"("slackThreadTs");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RequestChatMessage_slackChannelId_createdAt_idx" ON "RequestChatMessage"("slackChannelId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RequestChatMessage_requestId_idx" ON "RequestChatMessage"("requestId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SimpleTicket_category_status_idx" ON "SimpleTicket"("category", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SimpleTicket_requesterEmail_idx" ON "SimpleTicket"("requesterEmail");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SimpleTicket_updatedAt_idx" ON "SimpleTicket"("updatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StageEvent_requestId_toStage_idx" ON "StageEvent"("requestId", "toStage");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierEvaluation_requestId_idx" ON "SupplierEvaluation"("requestId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TicketMessage_ticketId_idx" ON "TicketMessage"("ticketId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserRole_role_idx" ON "UserRole"("role");

