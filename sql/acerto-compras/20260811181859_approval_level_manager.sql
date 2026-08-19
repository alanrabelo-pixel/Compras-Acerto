-- CreateTable
CREATE TABLE "ApprovalLevelManager" (
    "level" INTEGER NOT NULL,
    "approverId" TEXT,

    CONSTRAINT "ApprovalLevelManager_pkey" PRIMARY KEY ("level")
);

-- AddForeignKey
ALTER TABLE "ApprovalLevelManager" ADD CONSTRAINT "ApprovalLevelManager_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
