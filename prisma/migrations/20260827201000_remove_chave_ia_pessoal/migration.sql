-- Remove as chaves de IA pessoais (Anthropic/Gemini) de User.
--
-- POR QUE. Decisão do dono do sistema em 27/08/2026: os Assistentes de IA
-- (Nova Solicitação e AiInsightPanel, ver src/lib/integrations/ai.ts) passam
-- a usar uma chave única da empresa (ANTHROPIC_API_KEY/GEMINI_API_KEY no
-- ambiente), em vez de exigir que cada pessoa configure e cole a própria
-- chave. Ninguém mais lê nem grava estas duas colunas depois desta mudança de
-- código, e mantê-las seria guardar segredo de gente sem uso nenhum.
--
-- IDEMPOTENTE: IF EXISTS não falha rodando de novo.
ALTER TABLE "User" DROP COLUMN IF EXISTS "anthropicApiKey";
ALTER TABLE "User" DROP COLUMN IF EXISTS "geminiApiKey";
