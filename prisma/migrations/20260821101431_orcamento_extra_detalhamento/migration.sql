-- CreateEnum
CREATE TYPE "ExtraBudgetBasis" AS ENUM ('MENSAL', 'ANUAL', 'TOTAL');

-- CreateEnum
CREATE TYPE "ExtraBudgetImpact" AS ENUM ('RECORRENTE', 'PONTUAL');

-- AlterTable
ALTER TABLE "PurchaseRequest" ADD COLUMN     "extraBudgetBasis" "ExtraBudgetBasis",
ADD COLUMN     "extraBudgetEnd" TIMESTAMP(3),
ADD COLUMN     "extraBudgetImpact" "ExtraBudgetImpact",
ADD COLUMN     "extraBudgetJustification" TEXT,
ADD COLUMN     "extraBudgetStart" TIMESTAMP(3);

