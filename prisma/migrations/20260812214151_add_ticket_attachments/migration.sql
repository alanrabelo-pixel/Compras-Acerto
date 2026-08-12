-- DropForeignKey
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_requestId_fkey";

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "ticketId" TEXT,
ALTER COLUMN "requestId" DROP NOT NULL,
ALTER COLUMN "stage" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PurchaseRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SimpleTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
