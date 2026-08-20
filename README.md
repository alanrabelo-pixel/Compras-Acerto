# Acerto Compras: sistema próprio de processo de compras

> **v1.1**: este scaffold já incorpora a revisão de consistência e compliance
> (ver `docs/especificacao-tecnica.docx`, seção 12, para o detalhamento completo).
> Principais mudanças: alçadas renumeradas (1/2/3), segregação de função entre
> solicitante/comprador/aprovador, cadastro único de fornecedor com triagem
> obrigatória, controle de anti-fracionamento, faixas de risco (fast/standard/
> strategic), declaração de conflito de interesse, e escalonamento por SLA.

Este é o **scaffold inicial** do sistema que substitui o JIRA Service Management
no processo de compras da Acerto (Compras | F&NC). Foi gerado a partir do
documento de referência do fluxo e da especificação técnica (`docs/especificacao-tecnica.docx`,
entregue junto com este projeto).

> Este projeto foi começado no Claude.ai (chat). A partir daqui, o trabalho deve
> continuar no **Claude Code** (CLI), rodando localmente ou num repositório
> Git próprio. Este ambiente de chat não mantém banco de dados persistente
> nem serve a aplicação de verdade.

## Stack

- **Next.js 14** (App Router, TypeScript): front-end e back-end (API routes) no mesmo projeto
- **PostgreSQL + Prisma**: banco de dados e ORM (schema completo em `prisma/schema.prisma`)
- **NextAuth + Google OAuth**: SSO restrito a `@acerto.com.br`
- **Gmail API** e **Slack Web API**: notificações (stubs em `src/lib/integrations/`)
- Hospedagem recomendada: **Railway** (app + Postgres + cron no mesmo lugar, mais simples para operar sem time de infra dedicado). Alternativa: Render, ou Vercel (app) + Neon (Postgres) + serviço externo de cron.

## O que já está implementado (fatia vertical de prova de conceito)

- Schema de dados completo (`prisma/schema.prisma`) cobrindo todas as entidades do
  fluxo: Solicitação, Triagem, Validação Orçamentária + exceção, Due Diligence,
  Cotação/Mapa de Cotação, Aprovação por alçada, Jurídico, Pedido de Compra,
  Aguardando Entrega, Medição, Fiscal, Tesouraria, Mapeamento de Contrato + alertas,
  Avaliação (NPS), e log de notificações e, desde a revisão v1.1, cadastro
  único de fornecedor (`Supplier`) com triagem de compliance e declaração de
  conflito de interesse (`ConflictOfInterestDeclaration`).
- Máquina de estados (`src/lib/workflow.ts`) com todas as regras condicionais de
  roteamento (ex: Ferramenta Nova → Due Diligence; contrato → Jurídico; alçadas
  por valor) e, desde a v1.1, segregação de função, anti-fracionamento,
  faixas de risco (fast/standard/strategic) e mínimo de cotações por valor.
- Criação e listagem de Solicitação de Compra (`src/app/api/requests/route.ts`,
  `src/app/solicitacoes/page.tsx`) com disparo automático de e-mail e Slack.
- **Triagem** (`src/app/api/requests/[id]/triagem/route.ts`): comprador marca
  necessidade de contrato/mapeamento, calcula a lane (fast/standard/strategic)
  e o risco de fracionamento, com checagem de segregação de função.
- **Validação Orçamentária** (`src/app/api/requests/[id]/validacao-orcamentaria/route.ts`)
  segue caminho direto se há orçamento, ou workflow de exceção por alçada (Nível 1/2/3) se não há.
- **Aprovação** (`src/app/api/requests/[id]/aprovacao/route.ts`): cria a aprovação
  na alçada correta com prazo de escalonamento; decisão com personificação
  restrita ao Nível 1, conforme a revisão v1.1.
- Cron de alerta de renovação de contrato e cron de **escalonamento por SLA**
  de aprovações em atraso (`src/app/api/cron/`).
- Autenticação Google Workspace restrita ao domínio da Acerto.

## O que falta construir (próximos passos sugeridos para o Claude Code)

Siga o roadmap de fases descrito em `docs/especificacao-tecnica.docx`. Em ordem
de prioridade sugerida:

1. ~~Telas de Triagem, Validação Orçamentária e Aprovação~~: **endpoints prontos**;
   falta a interface (formulários) que os chama. Comece por aqui.
2. **Cotação e Mapa de Cotação**: upload de múltiplas cotações + comparação (saving %/$),
   respeitando o mínimo de cotações por valor (ver especificação, seção 4.2).
3. **Geração do PDF do Pedido de Compra**: reaproveitar a lógica já validada no
   gerador de Pedido de Compra existente da Acerto (ReportLab/PyPDF) ou portar
   para um gerador PDF em Node (ex: `@react-pdf/renderer`) para manter tudo no
   mesmo runtime.
4. **Mapeamento de Contrato + tela de gestão de contratos** (a base de dados e o
   cron já existem, falta a UI de cadastro).
5. **Dashboards e relatórios** (Saving, Ciclo de Compra, NPS, demandas por área/CC).
6. **Upload de anexos**: decidir entre Google Drive API (reaproveita o Workspace
   já usado pela Acerto) ou S3-compatível (Cloudflare R2, mais barato). Recomendação:
   começar com Google Drive API por já ter contas de serviço configuradas.
7. **Permissões por papel (RBAC)**: o schema já tem `UserRole`; falta o middleware
   de autorização nas rotas.

## Como rodar localmente

```bash
npm install
cp .env.example .env        # preencher com credenciais reais
npm run prisma:migrate      # cria as tabelas
npm run prisma:seed         # popula centros de custo e usuários-base
npm run dev
```

Use os scripts de npm, e não `npx prisma ...` direto: `prisma:migrate`,
`prisma:push`, `prisma:reset` e `prisma:studio` passam pela guarda de banco
(`src/lib/guarda-banco.ts`), que recusa rodar contra qualquer host que não seja
`localhost` ou `127.0.0.1`. Chamado direto, o `prisma` aplica a migração no
banco que estiver no `DATABASE_URL`, inclusive o de Produção. A exceção é
`npm run prisma:deploy` (`prisma migrate deploy`), que é justamente o comando
que a Vercel roda contra o banco remoto e por isso não é guardado.

## Integração com o futuro ERP

A Acerto ainda não tem um ERP definido para receber os lançamentos gerados
por este fluxo. Para não bloquear o desenvolvimento, deixamos uma API pronta
(`src/app/api/erp/`) no modelo **pull + callback**, autenticada por Bearer
token (`ERP_API_KEY`), disparada quando a solicitação chega em **Concluído**
(última etapa do fluxo):

- `GET /api/erp/purchase-requests?status=pending|synced|all`: lista
  solicitações concluídas (por padrão, só as ainda não confirmadas pelo ERP).
- `GET /api/erp/purchase-requests/:id`: payload completo para o ERP montar
  seu próprio lançamento: fornecedor, valores, centro de custo, linha de
  orçamento, itens do Pedido de Compra, dados fiscais/pagamento, PDF do PC.
  Só responde se a solicitação já estiver Concluída.
- `POST /api/erp/purchase-requests/:id/confirm`: callback do ERP
  confirmando a importação (`{ erpExternalId, note? }`); grava
  `erpSyncedAt`/`erpExternalId` na solicitação e registra um Comment +
  Notification de auditoria. Idempotente.

Quando o ERP real for definido, o trabalho que falta é: (1) configurar o
`ERP_API_KEY` de produção e entregá-lo ao time responsável pelo ERP, (2)
validar se o payload do `GET :id` cobre todos os campos que o ERP realmente
precisa (hoje é um chute educado a partir do que o sistema já modela), e (3)
decidir se o ERP vai fazer polling do endpoint de lista ou se faz mais
sentido este sistema chamar um webhook do ERP quando a solicitação conclui
(não implementado, ainda não há URL de destino).

## Assistentes de IA (Triagem, Due Diligence, Cotação, Mapa de Cotação, Jurídico, Mapeamento de Contrato)

Pedido do usuário: dar a quem atua em cada etapa uma "atuação de IA" focada em
estratégia, riscos, o que confirmar/evitar, em todas as etapas onde isso é
aplicável, rodando **Anthropic (Claude) e Gemini em paralelo** e mostrando as
duas sugestões lado a lado (pedido explícito do usuário: cada provedor
responde/falha de forma independente, não há fallback nem escolha única).

- `src/lib/integrations/ai.ts`: um prompt por etapa (`buildTriagemPrompt`,
  `buildDueDiligencePrompt`, `buildNegotiationPrompt`, `buildLegalReviewPrompt`,
  `buildContractReviewPrompt`), todos pedindo a mesma estrutura de resposta
  (`summary`/`highlights`/`cautions`/`recommendation`/`nextStep`), e
  `generateInsight(prompt, keys)` que chama Claude e Gemini em paralelo. Cada
  chamada recebe a **chave pessoal** de quem está atuando (ver abaixo), não
  uma chave única do app. Só o modelo (`ANTHROPIC_MODEL`/`GEMINI_MODEL`) segue
  vindo do `.env`, por ser uma escolha técnica do app, não uma credencial.
- **Chaves pessoais de IA** (pedido do usuário): todo mundo na Acerto já tem
  acesso próprio a Claude e Gemini, então os Assistentes usam a chave de quem
  está atuando na etapa no momento, não uma chave única da empresa/app:
  `User.anthropicApiKey`/`geminiApiKey` no schema, geridas por cada pessoa
  direto no painel do assistente (`AiInsightPanel` mostra se estão
  configuradas e permite salvar/atualizar). `GET/PATCH /api/users/:id/ai-keys`
  onde o `GET` nunca retorna o valor da chave, só se está configurada.
- `POST /api/requests/:id/ai-insight`: gera uma análise sob demanda a partir
  da etapa atual da solicitação (TRIAGEM, DUE_DILIGENCE, COTACAO,
  MAPA_COTACAO, JURIDICO ou MAPEAMENTO_CONTRATO, e outras etapas respondem
  409), com papel exigido conforme a etapa (COMPRADOR / PRIVACIDADE /
  JURIDICO), usando a chave pessoal de quem está atuando (`actorId`). Aceita
  um `draft` opcional no corpo com campos que a pessoa está digitando no
  formulário mas ainda não salvou (ex: observações do Jurídico, dados do
  contrato no Mapeamento), para a IA reagir ao que está sendo preenchido.
  Persiste os dois resultados (payload + modelo + erro de cada provedor) em
  `AiInsight`: histórico permanente por solicitação, independente de qual
  chave/pessoa gerou cada sugestão. `GET` lista o histórico completo da
  solicitação (todas as etapas, mais recente primeiro). Uma análise gerada
  em Cotação, por exemplo, continua visível quando a solicitação chega ao
  Mapa de Cotação.
- UI: `AiInsightPanel` (componente compartilhado, renderiza Claude e Gemini
  em colunas lado a lado, com status/edição das chaves pessoais de quem está
  selecionado no formulário), embutido nos formulários de Triagem, Due
  Diligence, Cotação, Mapa de Cotação, Jurídico e Mapeamento de Contrato em
  `RequestActions.tsx`.

Diferente do Gmail/Slack, esta integração **não falha silenciosamente**: sem
a chave pessoal configurada, cada provedor responde com seu próprio erro claro
("Você ainda não configurou sua chave pessoal da Anthropic/Gemini") em vez de
engolir a falha. É uma ação sob demanda, que precisa avisar na hora que a
sugestão não veio (a chave ausente de uma pessoa não afeta as demais, e um
provedor sem chave não impede o outro de responder).

## Assunções não verificadas (validar antes de produção)

- **Chaves pessoais de IA armazenadas em texto puro**: `User.anthropicApiKey`/
  `geminiApiKey` são guardadas sem criptografia neste ambiente de
  desenvolvimento. Antes de produção, avaliar criptografia em repouso ou um
  cofre de segredos (ex: KMS/Vault). Agora é uma chave por pessoa (potencialmente
  dezenas), não uma única chave de app, o que aumenta a superfície se o banco
  vazar. Também vale decidir um limite de uso/custo por pessoa, já que cada
  chave é cobrada na conta pessoal de quem a configurou.
- **Assistentes de IA (modelos e prompts)**: os modelos (`claude-sonnet-5` /
  `gemini-2.5-flash`, via env) e o formato dos prompts são um ponto de
  partida; vale revisar com cada time dono da etapa (Compras, Privacidade,
  Jurídico) se a análise sugerida está alinhada às políticas vigentes antes
  de expor em produção, em especial o Jurídico, cujo prompt já deixa
  explícito que é um apoio preliminar, não substitui a leitura integral do
  contrato.
- **E-mail via Gmail API com conta de serviço**: requer domain-wide delegation
  no Google Admin Console. Confirmar com SI e Privacidade se é viável ou se o
  time de infra prefere um relay SMTP tradicional.
- **Slack via Bot Token**: requer criar um Slack App interno com escopo
  `chat:write` e `users:read.email`. Confirmar se já existe um app reaproveitável.
- **Importação da Linha de Orçamento (FP&A)**: o schema tem um modelo `BudgetLine`
  simples; o mecanismo real de importação mensal (planilha, API, ou entrada manual)
  ainda precisa ser definido com o time de FP&A.
- **Geração do PDF do Pedido de Compra**: este scaffold não replica ainda o
  gerador Python/ReportLab já existente; ver ponto 3 acima.
- **Hospedagem em Railway** é uma recomendação por simplicidade operacional, não
  uma decisão validada com o time de infraestrutura/segurança da Acerto.
