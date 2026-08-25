-- CreateTable
CREATE TABLE IF NOT EXISTS "ApprovalTier" (
    "level" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "maxValue" DECIMAL(14,2),
    "requiredApprovers" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalTier_pkey" PRIMARY KEY ("level")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ApprovalTier_active_maxValue_idx" ON "ApprovalTier"("active", "maxValue");


-- Semente das tres faixas que ate aqui eram constantes em src/lib/workflow.ts
-- (approvalLevel e approvalsRequiredForLevel). Vai na propria migration, e nao
-- no seed, por dois motivos: o seed nao roda em producao, e uma tabela vazia
-- aqui deixaria o sistema sem nenhuma alcada, recusando toda aprovacao. Com
-- estas linhas, o comportamento no dia 1 e identico ao de antes.
INSERT INTO "ApprovalTier" ("level", "label", "maxValue", "requiredApprovers", "active", "createdAt", "updatedAt") VALUES
  (1, 'Nivel 1 (ate R$ 50 mil)', 50000.00, 1, true, NOW(), NOW()),
  (2, 'Nivel 2 (ate R$ 500 mil)', 500000.00, 2, true, NOW(), NOW()),
  (3, 'Nivel 3 (acima de R$ 500 mil)', NULL, 2, true, NOW(), NOW())
-- DO NOTHING, e nao DO UPDATE: estas tres linhas sao a semente inicial, e as
-- faixas passaram a ser editaveis pela tela em 21/08/2026. Reaplicar este
-- arquivo (a Golden Pipeline reenvia todo SQL que mudar num commit) nao pode
-- desfazer o que alguem configurou depois.
ON CONFLICT ("level") DO NOTHING;
