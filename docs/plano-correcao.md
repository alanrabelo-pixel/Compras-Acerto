# Plano de correção alAi

Documento operacional derivado da auditoria de 19/08/2026. Cada fase abaixo é um
prompt independente: abra uma sessão nova, cole o **Bloco de contexto** seguido da
fase que vai executar. Não rode duas fases na mesma sessão.

Ordem obrigatória: FASE 0 antes de tudo, depois P0, P1, P2, P3.

---

## Bloco de contexto (colar sempre, no início de qualquer fase)

```
Você vai trabalhar no sistema alAi (Acerto Compras), em
C:\Users\alan.rabelo\.copilot\acerto-compras-scaffold\acerto-compras

Stack: Next.js 14 App Router, TypeScript strict, Prisma + PostgreSQL,
NextAuth (Google SSO restrito a @acerto.com.br), Vitest, @react-pdf/renderer.
Sistema interno de compras de uma fintech brasileira. Todo texto de UI é pt-BR.
Ainda não está em produção.

REGRAS QUE NÃO PODEM SER VIOLADAS:

1. NUNCA execute comando que escreva no banco sem eu autorizar na hora:
   prisma migrate, prisma db push, prisma db seed, migrate reset, db execute,
   DROP, DELETE, UPDATE, INSERT, TRUNCATE. Em 18/08 um processo automatizado
   apagou o banco de desenvolvimento inteiro e a causa nunca foi identificada.
   Se uma tarefa exigir migration, PARE e me pergunte antes.

2. A marca se escreve exatamente "alAi". Nunca "ALAi", "AlAi" ou "ALAI".

3. Não use o caractere travessão (traço longo, U+2014) em lugar nenhum: nem em código, nem em
   comentário, nem em texto de UI, nem nas suas respostas para mim. O
   repositório foi limpo e está em zero. Use ponto, vírgula, dois-pontos,
   parênteses ou conectivo.

4. Antes de cada commit: `npx tsc --noEmit` limpo e `npx vitest run` passando.
   Hoje a baseline é 73/73. Se um teste passar a falhar, pare e me avise em vez
   de ajustar o teste para passar.

5. Commit e push depois de cada correção concluída, sem me perguntar:
   `git add -A -- ':!.env'` (esse comando sai com código 1 no Windows de forma
   inofensiva, confira com `git status --short`), depois
   `git push origin master:main`.

6. Pare o servidor de desenvolvimento antes de qualquer operação do Prisma
   (o Windows trava a dll do query engine com EPERM).

7. Não refatore o que não foi pedido. Se encontrar outro problema, me diga em
   uma linha e siga a tarefa.

ESTADO ATUAL DO AMBIENTE (importante):
- O banco de desenvolvimento está VAZIO (0 usuários, 0 solicitações).
- `prisma migrate status` reporta as 26 migrations como NÃO aplicadas, porque o
  schema foi recriado sem registrar histórico. Isso precisa ser resolvido na
  FASE 0 antes de qualquer trabalho que envolva migration.
```

---

## FASE 0. Recuperar o ambiente

Pré-requisito de tudo que envolve banco. Não pule.

```
TAREFA: recuperar o ambiente de desenvolvimento.

Contexto: o banco está vazio e o histórico de migrations não está registrado,
então o Prisma acha que nenhuma das 26 migrations foi aplicada, embora as
tabelas existam.

1. Rode `npx prisma migrate status` e me mostre a saída.
2. Me explique, antes de executar qualquer coisa, qual comando você usaria para
   reconciliar o histórico e por quê. As opções são `migrate reset` (destrói e
   reaplica tudo, registrando) ou `migrate resolve --applied` para cada migration
   (marca como aplicada sem executar). Diga qual é a correta para este caso e o
   risco de cada uma.
3. ESPERE minha autorização explícita antes de rodar.
4. Depois de autorizado e executado, rode o seed e confirme que voltaram
   usuários, papéis, centros de custo e linhas de orçamento.
5. Rode `npx vitest run` e me diga o resultado.

Não faça mais nada nesta sessão.
```

---

## FASE P0. Segurança, antes de qualquer deploy

Esta é a fase de maior risco. Rode com o modelo mais capaz disponível.

```
TAREFA: fechar as falhas críticas de autorização. Cinco itens, nesta ordem.
Faça um commit por item, com typecheck e testes passando entre eles.

--- P0.1 Identidade na decisão de aprovação ---

Arquivo: src/app/api/requests/[id]/aprovacao/route.ts, handler PATCH (~linha 114).

Problema confirmado: a única checagem de autorização está dentro de
`if (personifiedBy)`. Quem chama a rota escolhe se manda esse campo, portanto
escolhe se quer ser autorizado. Sem ele: nenhuma sessão, nenhum papel, nenhuma
comparação com approval.approverId. E o teto de alçada de R$ 50 mil também mora
dentro desse if, então é pulado junto.

Corrija:
(a) Derive a identidade de quem age da sessão (getServerSession), não do corpo.
(b) Sem personificação: exija que quem age seja o aprovador daquele Approval
    (session.user.id === approval.approverId). Caso contrário, 403.
(c) Valide `decision` contra a lista permitida antes de gravar. Hoje ela é
    gravada crua, e como o código só trata "REPROVADO" e "PENDENTE" de forma
    especial, qualquer outra string faz a solicitação avançar como aprovada.
(d) NÃO quebre o caminho de personificação: ele é uma funcionalidade legítima e
    já validada (comprador até o Nível 1, ADMIN sem teto, justificativa
    obrigatória, aviso por Slack ao aprovador real). Preserve inteiro.

--- P0.2 Rotas de API sob o middleware ---

Arquivo: src/middleware.ts, `matcher` na linha 74.

Problema: `/api/*` não está no matcher, então nenhuma rota de API passa pelo
middleware. 30 das 57 rotas não têm checagem própria de identidade.

Corrija adicionando `/api/:path*` ao matcher, com exceção explícita para as
rotas que têm autenticação própria e NÃO podem exigir sessão de usuário:
  - /api/auth/*        (NextAuth)
  - /api/cron/*        (Bearer CRON_SECRET)
  - /api/erp/*         (Bearer ERP_API_KEY)
  - /api/slack/events  (assinatura HMAC do Slack)

Depois disso, percorra as rotas restantes e confirme que nenhuma quebrou por
depender de acesso anônimo. Atenção especial: /api/manual/pdf é o link do
rodapé da home, e a abertura de chamado aceita gente sem usuário cadastrado.
Me diga se alguma dessas precisa continuar aberta e por quê, antes de fechar.

--- P0.3 Travar a flag de bypass ---

`LOCAL_BYPASS_AUTH` é lida em torno de 12 a 18 pontos e desliga autenticação E
autorização juntas (inclusive a comparação sessão x ator em src/lib/rbac.ts e
todas as rotas administrativas). Está "true" hoje e NÃO consta do .env.example.

Corrija:
(a) Crie um módulo único (ex: src/lib/bypass.ts) exportando uma constante que
    seja `process.env.NODE_ENV !== "production" && process.env.LOCAL_BYPASS_AUTH === "true"`.
(b) Substitua TODAS as leituras diretas de process.env.LOCAL_BYPASS_AUTH por ela.
    Use grep para achar todas, não confie em memória.
(c) Faça o boot falhar com mensagem clara se NODE_ENV for production e a flag
    estiver ligada.
(d) Documente a flag no .env.example, com aviso do que ela desliga.

--- P0.4 Webhook do Slack e importação de contratos ---

(a) src/app/api/slack/events/route.ts (~linha 67): `if (!secret) return true` é
    falha aberta. Troque para `return false`. O resto da função está correto
    (anti-replay de 300s, timingSafeEqual), não mexa.
(b) src/app/api/contratos/import/route.ts: exija sessão com papel ADMIN, seguindo
    o padrão já usado em src/app/api/cost-centers/route.ts. Adicione limite de
    tamanho do upload e de número de linhas.

--- P0.5 Testes de regressão ---

Escreva testes que falhem no código ANTIGO e passem no novo, cobrindo:
  1. PATCH /aprovacao sem personifiedBy, chamado por quem não é o aprovador -> 403
  2. PATCH /aprovacao com decision inválida ("X", "aprovado", "") -> 422
  3. PATCH /aprovacao com personificação legítima -> continua funcionando
  4. A cadeia completa: criar solicitação, declarar conflito, criar aprovação e
     decidir, tudo sem identidade válida -> bloqueado em algum ponto

Ao final da fase, me entregue: o que mudou por arquivo, o resultado dos testes,
e qualquer rota que você decidiu deixar aberta com a justificativa.
```

---

## FASE P1. Estrutura, antes de abrir para o time

```
TAREFA: corrigir os problemas estruturais. Seis itens. Um commit por item.

--- P1.1 Sessão e papéis não podem ficar velhos ---

src/lib/auth.ts: o campo `active` só é checado no callback signIn. Os callbacks
jwt e session nunca o leem, e a sessão é JWT com validade padrão de 30 dias.
Desativar alguém em /admin/acessos não encerra a sessão dela.

Corrija: no callback jwt, invalide o token se o usuário não existir ou estiver
inativo; recarregue os papéis do banco. Reduza session.maxAge para 8 horas.
Me avise se isso impactar performance de forma relevante.

--- P1.2 Índices ---

Não existe um único @@index em prisma/schema.prisma (835 linhas, 32 models).
Como o PostgreSQL não indexa chave estrangeira sozinho, todo filtro é varredura
sequencial.

Adicione índices para, no mínimo:
  StageEvent: [requestId, toStage]
  PurchaseRequest: createdAt, currentStage, updatedAt, requesterId
  SimpleTicket: [category, status]
  Contract: [status, renewalDate]
  Approval: [requestId, level], e [decision, dueAt, escalatedAt] para o cron
  RequestChatMessage: slackThreadTs, requestId
  Attachment: [requestId, category], ticketId
  UserRole: role

É migration ADITIVA, sem risco de dados. Mas PARE e me peça autorização antes de
rodar qualquer comando do Prisma, conforme a regra 1.

--- P1.3 Código sequencial da solicitação ---

src/app/api/requests/route.ts (~linha 80) gera PC-{ano}-{seq} com `count() + 1`
fora de transação, e o campo é único. Três defeitos: corrida entre duas criações
simultâneas (vira 500 e perde o formulário), contador global em vez de por ano
(o prefixo de ano mente a partir de janeiro), e colisão permanente se qualquer
registro for apagado.

Corrija com sequence do Postgres por ano, ou com retry sobre a violação de
unicidade. Aplique a mesma correção em src/app/api/tickets/route.ts (~linha 41),
que tem o mesmo padrão. Adicione teste de concorrência.

--- P1.4 Helper transacional de avanço de etapa ---

Esta é a mudança de maior alavancagem e a de maior risco. Faça por último dentro
da fase e com cuidado.

Hoje as 16 rotas de etapa repetem o mesmo padrão: buscar, checar currentStage,
atualizar, criar StageEvent, enviar e-mail. Sem transação (existe UM $transaction
em toda a base), sem try/catch (1 rota das 57 tem), e sem consultar o grafo de
transições válidas, que existe em src/lib/workflow.ts mas só é usado nos testes.

Crie um helper único que:
  (a) faça o guard de etapa de forma atômica (updateMany com currentStage no
      where, tratando count === 0 como 409)
  (b) chame isValidTransition do workflow.ts
  (c) envolva a atualização e a criação do StageEvent no mesmo $transaction
  (d) dispare a notificação FORA da transação, com o erro registrado e não
      engolido

Aplique nas 16 rotas, uma de cada vez, rodando os testes entre elas.
Não altere nenhuma regra de negócio, só a mecânica. Se encontrar uma rota cuja
regra não caiba no helper, me diga em vez de forçar.

--- P1.5 Tratamento de erro e ambiente ---

(a) Adicione error.tsx, global-error.tsx e not-found.tsx. Hoje não existe nenhum
    e uma exceção resulta em tela branca.
(b) Crie validação das variáveis de ambiente no boot, falhando com mensagem
    clara. Atenção: CRON_SECRET e ERP_API_KEY hoje são falha aberta, porque sem
    a variável a comparação vira `Bearer undefined` e quem mandar exatamente
    essa string passa.
(c) Adicione um logger estruturado mínimo. Hoje existe UMA chamada de console em
    todo o src/ e nenhum APM.
(d) Percorra os 14 pontos onde um erro é engolido sem registro e faça cada um
    registrar.

--- P1.6 Upload e arquivos ---

(a) Uploads não validam tipo nem tamanho. Copie o padrão que já está correto em
    src/app/api/users/[id]/avatar/route.ts (allowlist de MIME e limite de 2MB).
(b) Os PDFs de Pedido de Compra são gravados em public/ com nome previsível
    (PC-2026-0001.pdf), servidos estaticamente sem autenticação e enumeráveis.
    Além disso a pasta está no .gitignore, então somem no deploy. Mova para o
    mesmo mecanismo de storage dos outros anexos e sirva por rota autorizada.
```

---

## FASE P2. Qualidade de uso

Volume alto, risco baixo, muito texto. É a fase mais mecânica.

```
TAREFA: corrigir experiência e texto. Sete itens. Pode agrupar em 3 ou 4 commits.

--- P2.1 Confirmação de sucesso ---

Nenhuma das 14 ações de etapa produz confirmação: todas apenas dão
router.refresh(). Aprovar R$ 500 mil não mostra nada. Nos painéis
administrativos é pior: conceder papel, desativar usuário e trocar aprovadores
são silenciosos NO SUCESSO E NA FALHA (um 403 é descartado e a interface volta
ao estado anterior).

Use como modelo a tela de sucesso de src/components/NdaRequestForm.tsx (~linha
79), que é a única bem feita do sistema. Trate também os ~25 pontos de fetch que
hoje não reportam falha nenhuma.

--- P2.2 Códigos internos aparecendo na tela ---

Existe PRIORITY_LABEL definido no código e NUNCA usado: em 5 telas a pessoa lê
"CRITICA", "MEDIA", "BAIXA" cru, sem acento e em caixa alta. DEMAND_TYPE_LABEL é
ignorado nas telas de detalhe. Status de contrato não tem mapa de rótulos.
DEMAND_TYPE_LABEL ainda está duplicado em dois arquivos.

Aplique os mapas em todos os campos, crie o que falta, e elimine a duplicação.

--- P2.3 Mensagens de erro ---

De ~120 mensagens, ~40 contêm nome de variável, enum cru ou tipo de linguagem
("approverIds deve ser um array de strings", "roles (string[]) ou active
(boolean)", "treasuryNotified=true"). Só ~15 dizem o que fazer.

Reescreva as que expõem identificador e adicione o próximo passo nas que só
diagnosticam. Use como referência as boas que já existem em
src/app/api/requests/[id]/aprovacao/route.ts (~linha 54) e
src/app/api/users/[id]/avatar/route.ts (~linha 31).

Trate também os erros de biblioteca externa que chegam crus na interface (a
mensagem em inglês do provedor de IA é persistida e renderizada literalmente).

--- P2.4 Vocabulário ---

O mesmo objeto é "Chamado" no título e "Solicitação" no formulário dentro dele.
A mesma pessoa é "Gestor" em uma coluna e "Aprovador" na aba ao lado, e há uma
linha onde os dois termos convivem. "Demanda" é um terceiro substantivo para a
mesma coisa. Há também "Solicitação de Compra" e "Solicitação de Compras"
alternando entre telas.

Escolha uma palavra por conceito, me apresente a decisão antes de aplicar, e
então padronize.

--- P2.5 Estados vazios ---

De ~25, só 3 sugerem próximo passo. O pior é a tela principal de quem só faz
pedidos, que diz "Você ainda não abriu nenhuma solicitação" com o botão de criar
logo acima, sem mencioná-lo. Nas listas filtradas, nenhum oferece limpar filtro,
embora o controle exista.

--- P2.6 Jargão ---

Due Diligence, Mapa de Cotação, Medição, Alçada, Triagem, Homologação,
Personificação e NPS aparecem como rótulo puro, sem explicação. Existe um manual
em PDF completo, alcançável só por um link no rodapé da home, e nenhum dos 16
painéis de etapa aponta para ele. Adicione tooltip ou texto de ajuda nos termos,
e link do painel de cada etapa para a seção correspondente do manual.

--- P2.7 Integridade de dados de fornecedor ---

(a) CNPJ é texto livre sem normalização, e a checagem de fracionamento compara
    por igualdade exata. Formato divergente resulta em soma zero e nenhuma
    sinalização, justamente no controle antifraude. Normalize na escrita e
    migre os dados existentes.
(b) A importação de contratos não tem chave de deduplicação: subir a mesma
    planilha duas vezes duplica a base inteira, e o cron passa a disparar dois
    alertas por contrato.
```

---

## FASE P3. Escala e conformidade

```
TAREFA: preparar para volume. Quatro itens.

P3.1 Paginação nas listagens que hoje carregam a tabela inteira
     (src/lib/pendencias.ts roda em toda abertura da home e traz todas as
     solicitações abertas com 4 níveis de include, só para contar). Em
     src/lib/dashboard-data.ts, 21 queries sem take, com agregação em JavaScript
     onde o banco resolveria, e um IN que cresce sem limite.

P3.2 Notificações fora do caminho da requisição. Hoje toda rota espera o e-mail
     antes de responder, então a latência do Gmail entra no tempo de resposta.

P3.3 Constraints de coerência: o par decisão/data-de-decisão se repete em 6
     models sem nenhuma restrição ligando os dois, e vários campos que deveriam
     ser enum são texto livre (status, channel, managerApprovalDecision).
     Adicione CHECK via migration escrita à mão.

P3.4 Trilha de auditoria para mudança de permissão. Hoje UserRole e
     ApprovalLevelApprover são apagados com deleteMany, sem registro. São
     exatamente as duas tabelas que definem quem aprova dinheiro, e não há como
     responder quem removeu o papel de alguém, quando e por quê.

Também nesta fase: revisar o uso de dois provedores de IA em paralelo, mas
SOMENTE depois de gravar consumo de tokens por provedor no modelo AiInsight.
Hoje não há instrumentação nenhuma, então qualquer decisão seria no escuro.
```

---

## Correções de IA (encaixam em P2, listadas à parte por serem de outra natureza)

```
TAREFA: corrigir os pontos onde a IA duplica ou contradiz regra determinística.

1. src/lib/integrations/ai.ts, prompt de Triagem: pede ao modelo que recomende a
   faixa de risco (fast/standard/strategic). Essa regra JÁ EXISTE como função
   pura em src/lib/workflow.ts (determineLane), e os 5 parâmetros que ela recebe
   são exatamente os 5 campos que o prompt injeta. Troque: chame a função, exiba
   o resultado com a justificativa da regra, e deixe para a IA apenas o que ela
   faz bem (o que falta confirmar, riscos no texto livre).

2. Assistente de preenchimento: `likelyDueDiligence` é inferido pelo modelo de
   forma independente do demandType que ele mesmo classificou. A regra real é
   `demandType === "FERRAMENTA_NOVA"`. Hoje o modelo pode devolver um tipo que
   não gera Due Diligence e ainda assim marcar o sinalizador, e a tela exibe um
   aviso que contradiz o fluxo. Derive do demandType.

3. O caminho Gemini não valida enum (o caminho Anthropic tem json_schema, o
   Gemini só pede mimeType JSON). Valide no parser, no servidor, independente do
   provedor.

4. Prompt injection: o texto livre do solicitante é interpolado direto no corpo
   de instruções, sem delimitador. Envolva os dados em um bloco delimitado e
   adicione instrução de que aquilo é dado, nunca comando. Acrescente regra
   anti-alucinação: todo número na resposta deve estar literalmente nos dados
   fornecidos. Prioridade no prompt de Aprovação, que é lido por quem decide.

5. As sinalizações automáticas (fracionamento, conflito, personificação) são
   montadas em código, injetadas no prompt, e então o prompt pede ao modelo que
   as copie de volta na resposta. Além de pagar entrada e saída para um eco, se
   o modelo esquecer de copiar, o aprovador não vê a sinalização. Renderize
   direto na interface, sempre.

6. Grave `usage` (tokens de entrada e saída, por provedor) no modelo AiInsight.
   Sem isso é impossível medir custo real.
```
