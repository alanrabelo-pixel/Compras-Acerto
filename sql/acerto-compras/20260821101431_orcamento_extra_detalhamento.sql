-- CreateEnum
-- O Postgres nao tem CREATE TYPE IF NOT EXISTS, entao a protecao vem de um
-- bloco que ignora a excecao de "ja existe". Necessario porque a Golden
-- Pipeline reaplica todo arquivo SQL que mudar num commit (ver
-- scripts/tornar-migrations-idempotentes.cjs).
DO $$ BEGIN
  CREATE TYPE "ExtraBudgetBasis" AS ENUM ('MENSAL', 'ANUAL', 'TOTAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ExtraBudgetImpact" AS ENUM ('RECORRENTE', 'PONTUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "PurchaseRequest" ADD COLUMN IF NOT EXISTS "extraBudgetBasis" "ExtraBudgetBasis",
ADD COLUMN IF NOT EXISTS "extraBudgetEnd" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "extraBudgetImpact" "ExtraBudgetImpact",
ADD COLUMN IF NOT EXISTS "extraBudgetJustification" TEXT,
ADD COLUMN IF NOT EXISTS "extraBudgetStart" TIMESTAMP(3);

