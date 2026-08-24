-- AlterEnum
ALTER TYPE "Stage" ADD VALUE 'APROVACAO_GESTOR';

-- DropForeignKey
ALTER TABLE "PurchaseRequest" DROP CONSTRAINT "PurchaseRequest_approverManagerId_fkey";

-- AlterTable
ALTER TABLE "CostCenter" ADD COLUMN     "managerId" TEXT;

-- AlterTable
ALTER TABLE "PurchaseRequest" ADD COLUMN     "managerApprovalActorId" TEXT,
ADD COLUMN     "managerApprovalDecidedAt" TIMESTAMP(3),
ADD COLUMN     "managerApprovalDecision" TEXT,
ADD COLUMN     "managerApprovalJustification" TEXT,
ALTER COLUMN "approverManagerId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_approverManagerId_fkey" FOREIGN KEY ("approverManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
