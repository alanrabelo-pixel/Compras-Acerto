-- CreateTable
CREATE TABLE "PermissionChange" (
    "id" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "kind" TEXT NOT NULL,
    "antes" TEXT NOT NULL,
    "depois" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermissionChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PermissionChange_targetUserId_idx" ON "PermissionChange"("targetUserId");

-- CreateIndex
CREATE INDEX "PermissionChange_createdAt_idx" ON "PermissionChange"("createdAt");

-- AddForeignKey
ALTER TABLE "PermissionChange" ADD CONSTRAINT "PermissionChange_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

