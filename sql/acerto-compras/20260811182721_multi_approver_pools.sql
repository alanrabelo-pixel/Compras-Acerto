-- CreateTable (join table criada ANTES de remover a coluna antiga, para migrar os dados)
CREATE TABLE "_CostCenterManagers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_CostCenterManagers_AB_unique" ON "_CostCenterManagers"("A", "B");

-- CreateIndex
CREATE INDEX "_CostCenterManagers_B_index" ON "_CostCenterManagers"("B");

-- AddForeignKey
ALTER TABLE "_CostCenterManagers" ADD CONSTRAINT "_CostCenterManagers_A_fkey" FOREIGN KEY ("A") REFERENCES "CostCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CostCenterManagers" ADD CONSTRAINT "_CostCenterManagers_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrar dados existentes: cada CostCenter.managerId vira uma linha no pool (mais de um aprovador por centro de custo, pedido do usuário)
INSERT INTO "_CostCenterManagers" ("A", "B") SELECT "id", "managerId" FROM "CostCenter" WHERE "managerId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "CostCenter" DROP CONSTRAINT "CostCenter_managerId_fkey";

-- AlterTable
ALTER TABLE "CostCenter" DROP COLUMN "managerId";

-- AlterTable
ALTER TABLE "PurchaseRequest" ADD COLUMN "managerApprovalPersonifiedBy" TEXT;

-- DropForeignKey (ApprovalLevelManager nunca teve linhas gravadas nesta base — sem dado a preservar)
ALTER TABLE "ApprovalLevelManager" DROP CONSTRAINT "ApprovalLevelManager_approverId_fkey";

-- DropTable
DROP TABLE "ApprovalLevelManager";

-- CreateTable
CREATE TABLE "ApprovalLevelApprover" (
    "level" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ApprovalLevelApprover_pkey" PRIMARY KEY ("level","userId")
);

-- AddForeignKey
ALTER TABLE "ApprovalLevelApprover" ADD CONSTRAINT "ApprovalLevelApprover_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
