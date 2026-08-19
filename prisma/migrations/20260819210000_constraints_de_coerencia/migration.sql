-- Constraints de coerência.
--
-- Vários campos que são enum na prática eram texto livre no banco, com os
-- valores válidos escritos só num comentário do schema. Nada impedia gravar
-- "ABERTOO" em status, e a validação existia apenas no código da aplicação:
-- uma chamada direta, um script de correção ou uma importação futura passariam
-- por cima dela. O banco precisa recusar o que é inválido, não confiar em quem
-- escreve.
--
-- Escrita à mão porque o Prisma não modela CHECK. Consequência a saber:
-- estas constraints não aparecem em schema.prisma, então o Prisma não as
-- conhece. Um `migrate dev` futuro pode acusar drift; use `migrate deploy` ou
-- recrie estas constraints se precisar resetar.
--
-- Não estão aqui: SimpleTicket.status e Approval.decision, que já são enum de
-- verdade no Postgres e portanto já protegidos.

-- Status da solicitação de compra.
ALTER TABLE "PurchaseRequest"
  ADD CONSTRAINT "PurchaseRequest_status_valido"
  CHECK ("status" IN ('ABERTO', 'CANCELADO', 'CONCLUIDO'));

-- Decisão do gestor do centro de custo (etapa 2). Nulo enquanto não decidiu.
ALTER TABLE "PurchaseRequest"
  ADD CONSTRAINT "PurchaseRequest_decisao_do_gestor_valida"
  CHECK ("managerApprovalDecision" IS NULL OR "managerApprovalDecision" IN ('APROVADO', 'REPROVADO'));

-- Coerência entre a decisão do gestor e o momento dela: uma sem a outra
-- significa decisão sem data ou data sem decisão, e as duas contam a mesma
-- história pela metade numa auditoria.
ALTER TABLE "PurchaseRequest"
  ADD CONSTRAINT "PurchaseRequest_decisao_do_gestor_coerente"
  CHECK (
    ("managerApprovalDecision" IS NULL AND "managerApprovalDecidedAt" IS NULL)
    OR ("managerApprovalDecision" IS NOT NULL AND "managerApprovalDecidedAt" IS NOT NULL)
  );

ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_status_valido"
  CHECK ("status" IN ('ATIVO', 'RENOVACAO_EM_ANDAMENTO', 'CANCELADO'));

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_status_valido"
  CHECK ("status" IN ('PROGRAMADO', 'PAGO'));

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_canal_valido"
  CHECK ("channel" IN ('EMAIL', 'SLACK'));

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_status_valido"
  CHECK ("status" IN ('ENVIADO', 'FALHA'));

-- EMAIL_E_SLACK entrou quando o registro passou a refletir os dois canais:
-- antes gravava sempre EMAIL, mesmo quando o Slack também saía.
ALTER TABLE "ContractAlert"
  ADD CONSTRAINT "ContractAlert_canal_valido"
  CHECK ("channel" IN ('EMAIL', 'SLACK', 'EMAIL_E_SLACK'));

ALTER TABLE "RequestChatMessage"
  ADD CONSTRAINT "RequestChatMessage_papel_do_autor_valido"
  CHECK ("authorRole" IN ('COMPRADOR', 'SOLICITANTE'));

ALTER TABLE "RequestChatMessage"
  ADD CONSTRAINT "RequestChatMessage_origem_valida"
  CHECK ("source" IN ('APP', 'SLACK'));

ALTER TABLE "SimpleTicket"
  ADD CONSTRAINT "SimpleTicket_tipo_de_pedido_valido"
  CHECK ("requestKind" IS NULL OR "requestKind" IN ('NDA', 'CONTRATO'));
