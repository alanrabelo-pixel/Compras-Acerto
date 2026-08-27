-- A constraint de canal de Notification foi escrita a partir do comentário
-- "EMAIL | SLACK" do modelo, sem conferir o código. A rota de confirmação do
-- ERP (src/app/api/erp/purchase-requests/[id]/confirm/route.ts) grava
-- channel = 'ERP' desde antes, num caminho legítimo do fluxo, então a
-- constraint passou a rejeitar uma escrita correta e a derrubar a rota depois
-- de o erpSyncedAt já ter sido gravado.
--
-- Aqui a constraint passa a refletir o que o sistema de fato grava.
ALTER TABLE "Notification"
  DROP CONSTRAINT IF EXISTS "Notification_canal_valido";

ALTER TABLE "Notification"
  DROP CONSTRAINT IF EXISTS "Notification_canal_valido";
ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_canal_valido"
  CHECK ("channel" IN ('EMAIL', 'SLACK', 'ERP'));
