-- =====================================================================
-- CONFERÊNCIA PRÉ-DEPLOY, CONTRA O BANCO DE PRODUÇÃO
-- =====================================================================
--
-- Rodar ANTES de subir a versão integrada (commit a8f2432 em diante) em
-- compras.acerto.com.br.
--
-- É SOMENTE LEITURA. Não altera nada, não cria nada, não apaga nada.
-- Pode rodar com a aplicação no ar.
--
-- POR QUE ISTO EXISTE. A versão nova traz 8 migrations criadas depois de
-- 18/08, e três delas dependem de como os dados JÁ EXISTENTES em produção
-- estão. Isso não é verificável na máquina de desenvolvimento, porque lá o
-- banco tem outros dados. Cada consulta abaixo devolve ZERO quando está tudo
-- certo; qualquer número maior que zero é para resolver antes do deploy, e o
-- comentário diz o que acontece se ignorar.
--
-- Escrito em 25/08/2026, na integração da infraestrutura do time de
-- engenharia com a versão de produto.


-- ---------------------------------------------------------------------
-- 1. AS CONSTRAINTS DE COERÊNCIA (migration 20260819210000)
-- ---------------------------------------------------------------------
-- O Postgres VALIDA as linhas existentes ao criar uma CHECK constraint. Se
-- uma única linha violar, a migration falha, a Golden Pipeline aborta e o
-- deploy não acontece. A produção não cai (o pod antigo continua servindo),
-- mas a subida trava e o motivo aparece só no log do pipeline.
--
-- Esperado: 0 em todas as colunas.

SELECT
  (SELECT count(*) FROM "PurchaseRequest"
     WHERE "status" NOT IN ('ABERTO', 'CANCELADO', 'CONCLUIDO'))          AS req_status_invalido,
  (SELECT count(*) FROM "PurchaseRequest"
     WHERE "managerApprovalDecision" IS NOT NULL
       AND "managerApprovalDecision" NOT IN ('APROVADO', 'REPROVADO'))    AS decisao_gestor_invalida,
  (SELECT count(*) FROM "PurchaseRequest"
     WHERE ("managerApprovalDecision" IS NULL) <> ("managerApprovalDecidedAt" IS NULL))
                                                                          AS decisao_gestor_incoerente,
  (SELECT count(*) FROM "Contract"
     WHERE "status" NOT IN ('ATIVO', 'RENOVACAO_EM_ANDAMENTO', 'CANCELADO')) AS contrato_status_invalido,
  (SELECT count(*) FROM "Payment"
     WHERE "status" NOT IN ('PROGRAMADO', 'PAGO'))                        AS pagamento_status_invalido,
  (SELECT count(*) FROM "Notification"
     WHERE "channel" NOT IN ('EMAIL', 'SLACK', 'ERP'))                    AS notificacao_canal_invalido;


-- ---------------------------------------------------------------------
-- 2. ANEXOS DA ÉPOCA DO VERCEL BLOB
-- ---------------------------------------------------------------------
-- A troca para o S3 mudou o formato de Attachment.storageUrl: era a URL
-- pública inteira, virou uma chave "s3://". As linhas antigas continuam com
-- o formato antigo.
--
-- Já está tratado no código (src/lib/storage.ts lê os três formatos), então
-- isto NÃO bloqueia o deploy. O que a contagem responde é outra coisa: se
-- vier maior que zero, esses arquivos ainda moram no Vercel Blob, e
-- DESLIGAR A CONTA DA VERCEL os torna inacessíveis. Antes de encerrar a
-- conta, copiar os objetos para o bucket e reescrever as URLs.

SELECT
  count(*) FILTER (WHERE "storageUrl" LIKE 'https://%') AS anexos_ainda_no_vercel_blob,
  count(*) FILTER (WHERE "storageUrl" LIKE 's3://%')    AS anexos_no_s3,
  count(*) FILTER (WHERE "storageUrl" LIKE 'local://%') AS anexos_em_disco_local,
  count(*)                                              AS total
FROM "Attachment";

-- Mesmo formato é usado na foto de perfil.
SELECT count(*) AS avatares_ainda_no_vercel_blob
FROM "User" WHERE "avatarUrl" LIKE 'https://%';


-- ---------------------------------------------------------------------
-- 3. SOLICITAÇÕES PARADAS NA APROVAÇÃO DO GESTOR
-- ---------------------------------------------------------------------
-- Essa etapa saiu do fluxo em 21/08: quem abre solicitação agora vai direto
-- para a Triagem. O valor CONTINUA no enum de propósito, e a etapa continua
-- tendo saída para Triagem, então nada fica preso de forma irreversível.
--
-- Mas ela é ocultada do quadro (ETAPAS_OCULTAS_NO_QUADRO em
-- src/lib/workflow.ts). Uma solicitação que estiver ali no momento do deploy
-- SOME DA VISÃO do time, e ninguém vai lembrar de tocá-la. O deploy não
-- quebra; a solicitação é que fica esquecida.
--
-- Se vier alguma linha, mover para TRIAGEM antes de subir.

SELECT r."code", u."email" AS solicitante, r."createdAt"
FROM "PurchaseRequest" r
JOIN "User" u ON u."id" = r."requesterId"
WHERE r."currentStage" = 'APROVACAO_GESTOR'
ORDER BY r."createdAt";


-- ---------------------------------------------------------------------
-- 4. APROVADORES CADASTRADOS EM CADA FAIXA DE ALÇADA
-- ---------------------------------------------------------------------
-- Não tem a ver com o merge, e é a pendência mais provável de aparecer como
-- "o sistema não deixa avançar". POST /api/requests/[id]/aprovacao atribui o
-- aprovador a partir de ApprovalLevelApprover; sem ninguém cadastrado na
-- faixa do valor, a rota recusa com 422 e a solicitação para na etapa
-- Aprovação.
--
-- Cadastro em /admin/centros-de-custo, na mesma tela das faixas.
--
-- Esperado: nenhuma linha. Cada linha devolvida é uma faixa ativa sem
-- aprovador, e toda solicitação que cair no valor dela vai travar.

SELECT t."level", t."label", t."maxValue", t."requiredApprovers",
       count(a."userId") AS aprovadores_cadastrados
FROM "ApprovalTier" t
LEFT JOIN "ApprovalLevelApprover" a ON a."level" = t."level"
WHERE t."active"
GROUP BY t."level", t."label", t."maxValue", t."requiredApprovers"
HAVING count(a."userId") < t."requiredApprovers"
ORDER BY t."maxValue" NULLS LAST;


-- ---------------------------------------------------------------------
-- 5. GESTORES DOS CENTROS DE CUSTO
-- ---------------------------------------------------------------------
-- Estes não aprovam nada: recebem o ALERTA de abertura de solicitação
-- (decisão de 21/08). Centro de custo sem gestor não trava fluxo nenhum, o
-- alerta simplesmente não sai e ninguém percebe a ausência.
--
-- A relação é implícita no Prisma, daí o nome da tabela com underline.

SELECT cc."name"
FROM "CostCenter" cc
WHERE cc."active"
  AND NOT EXISTS (
    SELECT 1 FROM "_CostCenterManagers" m WHERE m."A" = cc."id" OR m."B" = cc."id"
  )
ORDER BY cc."name";
