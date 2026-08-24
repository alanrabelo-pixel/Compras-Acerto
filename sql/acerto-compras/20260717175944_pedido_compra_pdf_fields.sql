-- CreateEnum
CREATE TYPE "FreightType" AS ENUM ('CIF', 'FOB');

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "frete" "FreightType" NOT NULL DEFAULT 'CIF',
ADD COLUMN     "localEntrega" TEXT,
ADD COLUMN     "prazoEntrega" TEXT;

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(10,2) NOT NULL,
    "valorUnitario" DECIMAL(14,2) NOT NULL,
    "impostosPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "valorTotal" DECIMAL(14,2) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
