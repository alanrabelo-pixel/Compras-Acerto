-- Move para TRIAGEM o que ficou parado na etapa Aprovacao do Gestor.
--
-- POR QUE. A etapa saiu do fluxo em 21/08/2026, por decisao do dono do sistema:
-- solicitacao aberta vai direto para a Triagem, e quem faz o primeiro crivo e o
-- comprador. O valor continua no enum e a etapa continua com saida para TRIAGEM,
-- entao nada fica preso de forma irreversivel. O problema e outro: a etapa e
-- ocultada do quadro (ETAPAS_OCULTAS_NO_QUADRO em src/lib/workflow.ts), e a
-- versao que roda em producao hoje move TODA solicitacao para ela logo apos a
-- criacao. Sem esta migration, toda solicitacao aberta hoje SOME DO QUADRO no
-- dia do deploy. Nao se perde, mas ninguem ve, e ninguem lembra de toca-la.
--
-- SO O QUE ESTA EM ABERTO. Solicitacao cancelada ou concluida que por algum
-- motivo tenha ficado nessa etapa continua onde esta: ressuscita-la no quadro
-- seria pior que deixa-la escondida.
--
-- IDEMPOTENTE. O id do evento e derivado do id da solicitacao, entao rodar de
-- novo nao cria historico duplicado, e o UPDATE nao encontra mais nada.
--
-- POR QUE ESTE ARQUIVO FOI TOCADO DE NOVO EM 27/08/2026, SEM MUDAR O SQL. A
-- Golden Pipeline aplica migration olhando `git diff COMMIT^1 COMMIT` sobre
-- sql/acerto-compras/: só o que MUDOU naquele commit é executado. Este arquivo
-- e o semear_contador_com_codigos_existentes entraram na main pelo merge do
-- time de engenharia (PR #5, a partir do commit 551ddf9) ANTES de o pull
-- request do produto ser mergeado (#4). Na hora de calcular a diferença desse
-- segundo merge os dois já estavam idênticos dos dois lados, git não via
-- mudança nenhuma, e "Migration Services" pulou os dois em silêncio. Este
-- comentário é a mudança de conteúdo que faz o arquivo aparecer de novo no
-- diff do próximo commit, para a migration rodar de verdade.

-- 1. Registra a passagem no historico ANTES de mover, para o StageEvent contar a
--    verdade: veio de APROVACAO_GESTOR. Depois do UPDATE essa informacao some.
INSERT INTO "StageEvent" ("id", "requestId", "fromStage", "toStage", "comment", "createdAt")
SELECT
  md5("id" || ':aprovacao-gestor-para-triagem'),
  "id",
  'APROVACAO_GESTOR'::"Stage",
  'TRIAGEM'::"Stage",
  'Movida automaticamente: a etapa Aprovacao do Gestor saiu do fluxo em 21/08/2026 e a solicitacao seguiu para a Triagem.',
  CURRENT_TIMESTAMP
FROM "PurchaseRequest"
WHERE "currentStage" = 'APROVACAO_GESTOR'
  AND "status" = 'ABERTO'
ON CONFLICT ("id") DO NOTHING;

-- 2. Move.
UPDATE "PurchaseRequest"
SET "currentStage" = 'TRIAGEM'
WHERE "currentStage" = 'APROVACAO_GESTOR'
  AND "status" = 'ABERTO';
