-- CreateTable
CREATE TABLE IF NOT EXISTS "PermissionChange" (
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
CREATE INDEX IF NOT EXISTS "PermissionChange_targetUserId_idx" ON "PermissionChange"("targetUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PermissionChange_createdAt_idx" ON "PermissionChange"("createdAt");

-- AddForeignKey
ALTER TABLE "PermissionChange"
  DROP CONSTRAINT IF EXISTS "PermissionChange_targetUserId_fkey";
ALTER TABLE "PermissionChange"
  ADD CONSTRAINT "PermissionChange_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

