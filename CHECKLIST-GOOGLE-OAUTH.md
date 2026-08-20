# Checklist: ativar Google OAuth (SSO) em produção

Objetivo: sair de `LOCAL_BYPASS_AUTH="true"` (qualquer pessoa entra sem login)
para o SSO real via Google Workspace, restrito a `@acerto.com.br`
(`src/lib/auth.ts`, `hd: "acerto.com.br"`).

## 1. Google Cloud Console

1. Criar (ou reaproveitar) um projeto em [console.cloud.google.com](https://console.cloud.google.com).
2. **APIs & Services → OAuth consent screen**
   - User type: **Internal** (restringe a contas do Workspace `acerto.com.br`, e assim não precisa de verificação do Google).
   - Preencher nome do app, e-mail de suporte, domínio.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**.
   - Criar **um client por ambiente**, cada um com o seu próprio redirect URI. É
     o que [`docs/runbook-ambientes.md`](docs/runbook-ambientes.md) assume, e
     mantém a regra de não reaproveitar segredo entre Produção e Sandbox.
     - Produção: `https://<seu-domínio-de-produção>/api/auth/callback/google`
     - Sandbox: `https://<seu-domínio-de-sandbox>/api/auth/callback/google`
     - Local (dev, opcional, só quem for testar SSO localmente): `http://localhost:3000/api/auth/callback/google`
   - Salvar → copiar o **Client ID** e o **Client Secret** de cada um.

## 2. Variáveis de ambiente (Produção e Sandbox)

São dois projetos com painéis de variáveis separados. Preencher em cada um, e
nunca commitar.

A matriz completa das duas colunas está em
[`docs/runbook-ambientes.md`](docs/runbook-ambientes.md), e é ela que vale em
caso de divergência. Aqui ficam só as variáveis que dizem respeito ao SSO, mais
`APP_ENV`, que é a que decide se o ambiente é a Produção. `.env.example`
explica cada uma em detalhe.

| Variável | Produção | Sandbox |
|---|---|---|
| `APP_ENV` | `producao` | `sandbox` |
| `GOOGLE_CLIENT_ID` | client de Produção (passo 1) | client do Sandbox (passo 1) |
| `GOOGLE_CLIENT_SECRET` | idem | idem |
| `NEXTAUTH_URL` | URL pública real, ex: `https://compras.acerto.com.br` | URL pública do Sandbox |
| `APP_URL` | mesma URL pública | mesma URL pública do Sandbox |
| `NEXTAUTH_SECRET` | valor **novo e único**, gerado com `openssl rand -base64 32`. Nunca reaproveitar o de dev | **outro valor**, diferente do de Produção: com o mesmo segredo, um cookie de sessão emitido pelo Sandbox é aceito pela Produção |
| `DATABASE_URL` | banco de Produção | banco do Sandbox, com **`sandbox` ou `sbx` no nome** |
| `LOCAL_BYPASS_AUTH` | **não definir**, pois é a ausência dela que liga o SSO de verdade (ver `src/middleware.ts`) | **não definir**: o Sandbox é onde o SSO é testado, e com o bypass ligado não há SSO para testar |

**`APP_ENV` é a que mais dói esquecer.** Ausente, o valor é `sandbox`
(`src/lib/ambiente.ts`). Uma Produção que subir sem ela não manda e-mail nem
Slack, nunca, e exibe a faixa "SANDBOX" para todo mundo. Como o Sandbox exibe a
mesma faixa, ela deixa de distinguir um ambiente do outro, que é a única coisa
que ela faz. Declare a variável nos dois projetos, inclusive no Sandbox, onde o
valor coincide com o padrão. Se `NODE_ENV=production` e `APP_ENV` não disser
`producao`, o boot registra o aviso `ambiente_nao_declarado_como_producao`
(`src/lib/env.ts`): vale conferir esse log no primeiro deploy de Produção.

**Duas variáveis de e-mail não aparecem na tabela porque resolvem sozinhas.**
`GMAIL_SENDER` (remetente das mensagens) e `EMAIL_CONTROLADORIA` (destino dos
alertas de fracionamento e de escalonamento) seguem `APP_ENV` quando estão
vazias: em produção caem nas caixas reais, `compras@acerto.com.br` e
`controladoria@acerto.com.br`, sem precisar declarar nada; fora dela caem em
endereços `.invalid`, que não existem e não podem ser entregues por ninguém. No
Sandbox as duas ficam **vazias**, e isso é configuração, não esquecimento:
preencher qualquer uma delas ali com uma caixa real desfaz a proteção.

`DATABASE_URL` do Sandbox precisa da marca no nome porque o boot confere isso
(`src/lib/env.ts`) e recusa subir sem ela. O motivo é o erro mais provável ao
criar o segundo projeto, que é copiar as variáveis do primeiro: aí o Sandbox
grava solicitações na base real, e é o cron da **Produção**, esse com o envio
liberado, que manda as mensagens delas para pessoas de verdade. A trava de
envio do Sandbox não protege contra isso, porque quem envia é o outro processo.

## 3. Garantir pelo menos um ADMIN antes de desligar o bypass

Sem isso, ninguém consegue acessar `/admin/acessos` para liberar as outras pessoas depois do primeiro login.

**Mudou em 19/08/2026, leia antes de seguir instrução antiga.** Até esta data,
`prisma/seed.ts` cadastrava 22 colegas reais da Acerto, e este checklist mandava
rodar `npm run prisma:seed` contra o banco de produção para criar o `ADMIN`.
As duas coisas acabaram:

- O seed agora só cria **pessoas fictícias** em `@exemplo.invalid`, para que
  nenhum teste de Slack ou de e-mail alcance gente de verdade. Ele continua
  criando um `ADMIN`, mas um administrador fictício, útil apenas em
  desenvolvimento local: ninguém consegue logar com `@exemplo.invalid`, já que
  o SSO só aceita `@acerto.com.br`.
- O seed também passou a **recusar banco que não seja local** (`localhost` /
  `127.0.0.1`, ver `src/lib/guarda-banco.ts`). Apontado para Produção ou
  Sandbox, ele para antes de escrever qualquer linha. Isso é proposital: seed
  em banco de produção é escrita em massa sem desfazer.

O primeiro administrador real de Produção passa a ser um **passo manual e
consciente**, feito uma vez:

1. Deixar `LOCAL_BYPASS_AUTH` desligado e fazer o **primeiro login** com a conta
   `@acerto.com.br` que vai administrar. O callback de `signIn`
   (`src/lib/auth.ts`) cria o `User` sozinho, com o papel `SOLICITANTE` e mais
   nada: papel elevado nunca é concedido pelo login.
2. Conceder `ADMIN` a esse usuário direto no banco de produção. Pelo Prisma
   Studio (`DATABASE_URL` de produção no ambiente do comando, tabela
   `UserRole`, criar a linha com o `userId` da pessoa e `role = ADMIN`), ou por
   SQL:

   ```sql
   INSERT INTO "UserRole" (id, "userId", role)
   SELECT gen_random_uuid()::text, u.id, 'ADMIN'
   FROM "User" u
   WHERE u.email = 'pessoa.responsavel@acerto.com.br'
   ON CONFLICT ("userId", role) DO NOTHING;
   ```

   (`gen_random_uuid()` é nativo do PostgreSQL 13+. Em versão anterior, gerar o
   `id` por fora e passar como literal.)
3. Confirmar entrando em `/admin/acessos` com essa conta. Daí para frente todo
   papel, inclusive novos `ADMIN`, é concedido por lá, na interface, com
   registro de auditoria, e nunca mais por seed.

Nota sobre os papéis de alçada da exceção orçamentária (`COORDENACAO` e
`GERENTE_FNC`, ver `budgetExceptionApproverRole` em `workflow.ts`): no seed eles
estão em pessoas fictícias, só para o fluxo ficar testável em desenvolvimento.
Quem de fato ocupa cada um precisa ser confirmado com Compras | F&NC e marcado
em `/admin/acessos`.

## 4. Teste do fluxo completo (antes de desligar o bypass em definitivo)

1. Com `LOCAL_BYPASS_AUTH="false"` no Sandbox (não em produção direto):
   - Login com uma conta `@acerto.com.br` → deve criar/reconhecer o `User` (signIn callback em `src/lib/auth.ts`).
   - Login com uma conta fora do domínio → deve ser recusado (checar `hd`/validação do e-mail no callback).
   - Conta desativada (`User.active = false`) → deve ser bloqueada mesmo com login Google válido.
2. Confirmar que `/admin/acessos` está acessível para quem tem papel `ADMIN` e bloqueado para os demais.
3. Confirmar que `/solicitacoes`, `/contratos`, `/dashboards` respeitam `canViewBoard` (middleware, `src/middleware.ts`).
4. Conferir que cada ambiente se declarou certo, o que só dá para ver depois do
   deploy: a faixa "SANDBOX" aparece no Sandbox e **não** aparece em Produção.
   Se aparecer nos dois, `APP_ENV` não chegou na Produção. A conferência
   completa da separação entre os ambientes, incluindo o teste de envio
   bloqueado, está na seção 7 de
   [`docs/runbook-ambientes.md`](docs/runbook-ambientes.md).

## 5. Pendência documentada (não é bloqueio técnico, é aprovação)

- **Assunção não verificada** (já no README): confirmar com **Rafael Martins (SI e Privacidade)** se apps internos podem usar OAuth do Workspace sem passar por processo de aprovação do Google Admin. Fazer essa confirmação em paralelo aos passos acima, já que não impede configurar, mas precisa estar resolvido antes do go-live real.

## 6. Depois que o SSO estiver validado

- Remover de vez `LOCAL_BYPASS_AUTH` do `.env` de produção (não deixar como `"false"` residual, porque é melhor nem existir a variável lá).
- Nesse momento faz sentido também endurecer as rotas de API que hoje confiam em `actorId` vindo do corpo da requisição (ver item separado de segurança/arquitetura), sendo que o SSO é o pré-requisito para isso funcionar de verdade.
