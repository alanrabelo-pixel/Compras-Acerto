-- CreateTable
CREATE TABLE "CodeCounter" (
    "prefix" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CodeCounter_pkey" PRIMARY KEY ("prefix")
);

-- CreateIndex
CREATE INDEX "AiInsight_requestId_idx" ON "AiInsight"("requestId");

-- CreateIndex
CREATE INDEX "Announcement_createdAt_idx" ON "Announcement"("createdAt");

-- CreateIndex
CREATE INDEX "Approval_requestId_level_idx" ON "Approval"("requestId", "level");

-- CreateIndex
CREATE INDEX "Approval_decision_dueAt_escalatedAt_idx" ON "Approval"("decision", "dueAt", "escalatedAt");

-- CreateIndex
CREATE INDEX "Attachment_requestId_category_idx" ON "Attachment"("requestId", "category");

-- CreateIndex
CREATE INDEX "Attachment_ticketId_idx" ON "Attachment"("ticketId");

-- CreateIndex
CREATE INDEX "BudgetException_requestId_idx" ON "BudgetException"("requestId");

-- CreateIndex
CREATE INDEX "Comment_requestId_idx" ON "Comment"("requestId");

-- CreateIndex
CREATE INDEX "ConflictOfInterestDeclaration_requestId_idx" ON "ConflictOfInterestDeclaration"("requestId");

-- CreateIndex
CREATE INDEX "Contract_status_renewalDate_idx" ON "Contract"("status", "renewalDate");

-- CreateIndex
CREATE INDEX "Contract_contractManagerId_idx" ON "Contract"("contractManagerId");

-- CreateIndex
CREATE INDEX "Contract_supplierId_idx" ON "Contract"("supplierId");

-- CreateIndex
CREATE INDEX "ContractAlert_contractId_idx" ON "ContractAlert"("contractId");

-- CreateIndex
CREATE INDEX "DueDiligenceReview_requestId_idx" ON "DueDiligenceReview"("requestId");

-- CreateIndex
CREATE INDEX "FiscalDocument_requestId_idx" ON "FiscalDocument"("requestId");

-- CreateIndex
CREATE INDEX "LegalReview_requestId_idx" ON "LegalReview"("requestId");

-- CreateIndex
CREATE INDEX "Measurement_requestId_idx" ON "Measurement"("requestId");

-- CreateIndex
CREATE INDEX "Notification_requestId_idx" ON "Notification"("requestId");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "Payment_requestId_idx" ON "Payment"("requestId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_createdAt_idx" ON "PurchaseOrder"("createdAt");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierCnpj_idx" ON "PurchaseOrder"("supplierCnpj");

-- CreateIndex
CREATE INDEX "PurchaseRequest_currentStage_idx" ON "PurchaseRequest"("currentStage");

-- CreateIndex
CREATE INDEX "PurchaseRequest_createdAt_idx" ON "PurchaseRequest"("createdAt");

-- CreateIndex
CREATE INDEX "PurchaseRequest_updatedAt_idx" ON "PurchaseRequest"("updatedAt");

-- CreateIndex
CREATE INDEX "PurchaseRequest_requesterId_idx" ON "PurchaseRequest"("requesterId");

-- CreateIndex
CREATE INDEX "PurchaseRequest_buyerId_idx" ON "PurchaseRequest"("buyerId");

-- CreateIndex
CREATE INDEX "PurchaseRequest_costCenterId_idx" ON "PurchaseRequest"("costCenterId");

-- CreateIndex
CREATE INDEX "PurchaseRequest_status_idx" ON "PurchaseRequest"("status");

-- CreateIndex
CREATE INDEX "PurchaseRequest_demandType_idx" ON "PurchaseRequest"("demandType");

-- CreateIndex
CREATE INDEX "PurchaseRequest_diretoria_idx" ON "PurchaseRequest"("diretoria");

-- CreateIndex
CREATE INDEX "PurchaseRequest_erpSyncedAt_idx" ON "PurchaseRequest"("erpSyncedAt");

-- CreateIndex
CREATE INDEX "Quote_requestId_idx" ON "Quote"("requestId");

-- CreateIndex
CREATE INDEX "Quote_supplierId_idx" ON "Quote"("supplierId");

-- CreateIndex
CREATE INDEX "RequestChatMessage_slackThreadTs_idx" ON "RequestChatMessage"("slackThreadTs");

-- CreateIndex
CREATE INDEX "RequestChatMessage_slackChannelId_createdAt_idx" ON "RequestChatMessage"("slackChannelId", "createdAt");

-- CreateIndex
CREATE INDEX "RequestChatMessage_requestId_idx" ON "RequestChatMessage"("requestId");

-- CreateIndex
CREATE INDEX "SimpleTicket_category_status_idx" ON "SimpleTicket"("category", "status");

-- CreateIndex
CREATE INDEX "SimpleTicket_requesterEmail_idx" ON "SimpleTicket"("requesterEmail");

-- CreateIndex
CREATE INDEX "SimpleTicket_updatedAt_idx" ON "SimpleTicket"("updatedAt");

-- CreateIndex
CREATE INDEX "StageEvent_requestId_toStage_idx" ON "StageEvent"("requestId", "toStage");

-- CreateIndex
CREATE INDEX "SupplierEvaluation_requestId_idx" ON "SupplierEvaluation"("requestId");

-- CreateIndex
CREATE INDEX "TicketMessage_ticketId_idx" ON "TicketMessage"("ticketId");

-- CreateIndex
CREATE INDEX "UserRole_role_idx" ON "UserRole"("role");

