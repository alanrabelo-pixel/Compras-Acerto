/*
  Warnings:

  - You are about to drop the `NegotiationInsight` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "NegotiationInsight" DROP CONSTRAINT "NegotiationInsight_requestId_fkey";

-- DropForeignKey
ALTER TABLE "NegotiationInsight" DROP CONSTRAINT "NegotiationInsight_requestedById_fkey";

-- DropTable
DROP TABLE "NegotiationInsight";

-- CreateTable
CREATE TABLE "AiInsight" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "stage" "Stage" NOT NULL,
    "requestedById" TEXT,
    "anthropicPayload" TEXT,
    "anthropicModel" TEXT,
    "anthropicError" TEXT,
    "geminiPayload" TEXT,
    "geminiModel" TEXT,
    "geminiError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInsight_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AiInsight" ADD CONSTRAINT "AiInsight_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInsight" ADD CONSTRAINT "AiInsight_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
