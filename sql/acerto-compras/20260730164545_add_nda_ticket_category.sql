-- AlterEnum
ALTER TYPE "TicketCategory" ADD VALUE 'NDA';

-- AlterTable
ALTER TABLE "SimpleTicket" ADD COLUMN     "supplierContactEmail" TEXT,
ADD COLUMN     "supplierContactName" TEXT,
ADD COLUMN     "supplierContactPhone" TEXT,
ADD COLUMN     "supplierContactRole" TEXT,
ADD COLUMN     "supplierName" TEXT;
