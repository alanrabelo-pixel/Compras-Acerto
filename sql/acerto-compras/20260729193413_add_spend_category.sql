-- CreateEnum
CREATE TYPE "SpendCategory" AS ENUM ('TI', 'MARKETING', 'RH', 'FACILITIES', 'LOGISTICA', 'INDUSTRIAL', 'SERVICOS_GERAIS', 'OUTROS');

-- AlterTable
ALTER TABLE "PurchaseRequest" ADD COLUMN     "category" "SpendCategory";
