-- AlterTable
ALTER TABLE "PurchaseRequest" ADD COLUMN     "erpExternalId" TEXT,
ADD COLUMN     "erpSyncedAt" TIMESTAMP(3);
