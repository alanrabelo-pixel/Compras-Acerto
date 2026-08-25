-- AlterTable
ALTER TABLE "PurchaseRequest" ADD COLUMN IF NOT EXISTS "extraBudget" BOOLEAN NOT NULL DEFAULT false;

