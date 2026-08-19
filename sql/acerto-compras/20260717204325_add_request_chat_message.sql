-- CreateTable
CREATE TABLE "RequestChatMessage" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'APP',
    "slackChannelId" TEXT,
    "slackTs" TEXT,
    "slackThreadTs" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestChatMessage_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "RequestChatMessage" ADD CONSTRAINT "RequestChatMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
