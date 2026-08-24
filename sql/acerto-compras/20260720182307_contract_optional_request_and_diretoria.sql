-- DropForeignKey
ALTER TABLE "Contract" DROP CONSTRAINT "Contract_requestId_fkey";

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "diretoria" "Diretoria",
ALTER COLUMN "requestId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PurchaseRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
