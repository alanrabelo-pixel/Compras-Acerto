-- Semeia CodeCounter a partir dos codigos JA EMITIDOS.
--
-- POR QUE ISTO E NECESSARIO. A tabela CodeCounter nasceu vazia na migration
-- 20260819180000, e proximoCodigo() (src/lib/codigo.ts) faz
-- INSERT ... ON CONFLICT DO UPDATE devolvendo 1 na primeira chamada de cada
-- escopo. Num banco novo isso esta certo. Num banco que JA TEM historico, nao:
-- a producao emitiu codigos desde julho usando count()+1, entao a primeira
-- solicitacao criada depois do deploy receberia PC-2026-0001 de novo. Como
-- PurchaseRequest.code e SimpleTicket.code sao UNIQUE, o INSERT falha e
-- CRIAR SOLICITACAO PASSA A DAR ERRO, para todo mundo, ate alguem descobrir.
--
-- O escopo do contador e "<PREFIXO>-<ANO>" (ex.: "PC-2026"), e o sequencial e
-- o trecho numerico final. As duas tabelas com codigo entram: PurchaseRequest
-- (PC) e SimpleTicket (VG, FC e demais categorias).
--
-- IDEMPOTENTE E SEGURA POR CONSTRUCAO: o GREATEST no ON CONFLICT nunca REDUZ um
-- contador. Rodar de novo, ou rodar num banco onde o contador ja passou a
-- frente dos codigos historicos, nao tem efeito nenhum.
--
-- POR QUE ESTE ARQUIVO FOI TOCADO DE NOVO EM 27/08/2026, SEM MUDAR O SQL. A
-- Golden Pipeline aplica migration olhando `git diff COMMIT^1 COMMIT` sobre
-- sql/acerto-compras/: só o que MUDOU naquele commit é executado. Este arquivo
-- e o mover_aprovacao_gestor_para_triagem entraram na main pelo merge do time
-- de engenharia (PR #5, a partir do commit 551ddf9) ANTES de o pull request
-- do produto ser mergeado (#4), então na hora de calcular a diferença do
-- merge #4 os dois já estavam idênticos dos dois lados — git não via mudança
-- nenhuma, e o passo "Migration Services" pulou os dois em silêncio. A tabela
-- CodeCounter chegou a ser criada (outra migration) mas ficou vazia, o que
-- teria quebrado a criação de solicitação na primeira tentativa depois do
-- deploy. Este comentário é a mudança de conteúdo que faz o arquivo aparecer
-- de novo no diff do próximo commit, para a migration rodar de verdade.
INSERT INTO "CodeCounter" ("prefix", "value")
SELECT escopo, MAX(sequencial)
FROM (
  SELECT
    substring("code" from '^(.*)-[0-9]+$')          AS escopo,
    (substring("code" from '-([0-9]+)$'))::integer  AS sequencial
  FROM "PurchaseRequest"
  WHERE "code" ~ '^.+-[0-9]+$'
  UNION ALL
  SELECT
    substring("code" from '^(.*)-[0-9]+$'),
    (substring("code" from '-([0-9]+)$'))::integer
  FROM "SimpleTicket"
  WHERE "code" ~ '^.+-[0-9]+$'
) AS codigos
WHERE escopo IS NOT NULL
GROUP BY escopo
ON CONFLICT ("prefix") DO UPDATE
  SET "value" = GREATEST("CodeCounter"."value", EXCLUDED."value");
