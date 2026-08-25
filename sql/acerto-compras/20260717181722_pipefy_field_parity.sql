/*
  Warnings:

  - Added the required column `leadershipPreApproved` to the `PurchaseRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `suggestedDeadline` to the `PurchaseRequest` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AttachmentCategory" AS ENUM ('GERAL', 'PROPOSTA_FORNECEDOR_INDICADO', 'APROVACAO_EXTRA_ORCAMENTARIA', 'ANEXO_COMPLEMENTAR');

-- AlterEnum
ALTER TYPE "DemandType" ADD VALUE 'FERRAMENTA_UPGRADE_DOWNGRADE';

-- AlterEnum
ALTER TYPE "Priority" ADD VALUE 'CRITICA';

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "category" "AttachmentCategory" NOT NULL DEFAULT 'GERAL';

-- AlterTable
ALTER TABLE "BudgetException" ADD COLUMN     "attachmentId" TEXT;

-- AlterTable (colunas novas criadas anuláveis para permitir backfill de linhas de teste já existentes)
ALTER TABLE "PurchaseRequest" ADD COLUMN     "affectedUsers" TEXT,
ADD COLUMN     "indicatedSupplierEmail" TEXT,
ADD COLUMN     "indicatedSupplierName" TEXT,
ADD COLUMN     "indicatedSupplierPhone" TEXT,
ADD COLUMN     "indicatedSupplierWebsite" TEXT,
ADD COLUMN     "leadershipPreApproved" BOOLEAN,
ADD COLUMN     "suggestedDeadline" TIMESTAMP(3),
ALTER COLUMN "estimatedValue" DROP NOT NULL;

-- Backfill de dados de teste já existentes (ambiente de desenvolvimento local).
UPDATE "PurchaseRequest" SET "leadershipPreApproved" = false WHERE "leadershipPreApproved" IS NULL;
UPDATE "PurchaseRequest" SET "suggestedDeadline" = COALESCE("slaDeadline", "createdAt" + INTERVAL '30 days') WHERE "suggestedDeadline" IS NULL;

ALTER TABLE "PurchaseRequest" ALTER COLUMN "leadershipPreApproved" SET NOT NULL,
ALTER COLUMN "suggestedDeadline" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "BudgetException" ADD CONSTRAINT "BudgetException_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
