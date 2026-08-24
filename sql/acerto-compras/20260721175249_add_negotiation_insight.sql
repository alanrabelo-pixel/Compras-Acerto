-- CreateTable
CREATE TABLE "NegotiationInsight" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "stage" "Stage" NOT NULL,
    "requestedById" TEXT,
    "summary" TEXT NOT NULL,
    "talkingPoints" TEXT NOT NULL,
    "pitfalls" TEXT NOT NULL,
    "suggestedRange" TEXT,
    "nextStep" TEXT,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NegotiationInsight_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "NegotiationInsight" ADD CONSTRAINT "NegotiationInsight_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationInsight" ADD CONSTRAINT "NegotiationInsight_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
