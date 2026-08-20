# Runbook: provisionar Produção e Sandbox

Sequência para criar os dois ambientes do alAi. Escrito para ser seguido de
cima para baixo, uma vez só, por quem tem acesso aos painéis. Nenhum passo
depende de escrever código.

A ordem importa: cada bloco produz um valor que o bloco seguinte consome.

---

## LEIA ANTES: este documento assume Vercel, e o destino mudou para AWS

Este runbook foi escrito em 20/08/2026 assumindo deploy na Vercel, que era a
plataforma sugerida pelo próprio repositório (`BLOB_READ_WRITE_TOKEN` no
`.env.example`). Depois disso o time definiu **AWS** como destino. O documento
não foi reescrito, então separe o que vale do que não vale.

**O que vale igual, independente de plataforma.** É a maior parte, e é o que
protege os dois ambientes um do outro:

- `APP_ENV` com dois valores, padrão `sandbox` quando ausente
- a convenção de nome do banco (`sandbox` ou `sbx`), que o boot confere
- segredo novo para cada variável, sem reaproveitar nenhum valor
- credenciais de envio VAZIAS no Sandbox
- `AI_KEY_ENCRYPTION_SECRET` diferente por ambiente
- a tabela de variáveis da seção 4, coluna a coluna
- a lista de conferência da seção 7, inteira

**O que muda, e um item é bloqueante.**

1. **Armazenamento de arquivos é código, não configuração.**
   `src/lib/storage.ts` importa `put` de `@vercel/blob`, que é a única
   dependência de plataforma no projeto inteiro. Em AWS essa chamada não
   funciona, e o código cai silenciosamente para disco local, que é efêmero na
   maioria dos runtimes. O upload parece dar certo, o anexo é gravado no banco,
   e o arquivo some no próximo deploy. **Trocar por S3 é trabalho de código, com
   teste, antes do primeiro anexo real.** Não dá para resolver no painel.
2. Dois projetos Vercel viram duas contas ou dois ambientes isolados na AWS. O
   motivo do conselho continua: o que se quer evitar é armazenamento e segredo
   compartilhados por padrão entre os dois.
3. `BLOB_READ_WRITE_TOKEN` some da tabela e entra o que o S3 exigir.
4. Agendador: onde o documento diz Vercel Cron, leia EventBridge ou equivalente,
   apontado só para a Produção. As rotas de cron já se autenticam por
   `CRON_SECRET`, isso não muda.
5. A validação de boot depende de `NODE_ENV=production` para neutralizar o
   desvio de autenticação. Confirme que o runtime escolhido define isso.

Os clientes OAuth do Google (seção 2) não mudam: o que importa é a URL de
callback bater com o domínio de cada ambiente.

---

## Antes de começar

**Dois projetos, não dois ambientes de um projeto.** A Vercel injeta o token de
Blob automaticamente em Production e Preview do MESMO projeto. Fossem ambientes
de um projeto só, os dois compartilhariam armazenamento de arquivos por padrão,
sem ninguém decidir isso, e um anexo de teste iria parar no mesmo lugar dos
contratos assinados de verdade.

**O que você vai criar:**

| Recurso | Produção | Sandbox |
|---|---|---|
| Projeto Vercel | `alai-compras` | `alai-compras-sandbox` |
| Banco Postgres | `alai_producao` | `alai_sandbox` |
| Blob store | próprio | próprio |
| Cliente OAuth Google | próprio | próprio |
| Domínio | `compras.acerto.com.br` | `sandbox-compras.acerto.com.br` |

**O nome do banco do Sandbox não é decoração.** `src/lib/env.ts` confere no boot
se o banco tem `sandbox` ou `sbx` no nome quando `APP_ENV=sandbox`, e o
processo não sobe se não tiver. Isso existe porque nenhum código consegue olhar
uma URL e saber se aquilo é o banco de produção, e a cópia de variáveis de um
ambiente para o outro é o caminho de menor esforço na hora de provisionar.

---

## 1. Bancos

Crie os dois primeiro, porque a URL de conexão é o primeiro valor que os
projetos precisam.

1. Provisione o Postgres de produção com o nome de base `alai_producao`.
2. Provisione o do Sandbox com o nome de base `alai_sandbox`.
3. **Usuários distintos.** Cada banco com seu próprio usuário e senha. Nunca o
   mesmo par nos dois: um usuário que alcança os dois bancos anula toda a
   separação, porque aí uma URL trocada por engano funciona.
4. Guarde as duas URLs. A de produção **não deve existir em nenhuma máquina**,
   só no painel da Vercel.

---

## 2. Clientes OAuth do Google

Dois clientes separados, no Google Cloud Console. Custa dois minutos a mais e
compra duas coisas: o Google anuncia qual ambiente é **antes** do login, na
tela de consentimento, e dá revogação independente.

Para cada um, em Credenciais, criar ID do cliente OAuth do tipo Aplicativo Web:

| Campo | Produção | Sandbox |
|---|---|---|
| Nome | alAi Compras | alAi Compras (Sandbox) |
| Origem JavaScript autorizada | `https://compras.acerto.com.br` | `https://sandbox-compras.acerto.com.br` |
| URI de redirecionamento | `https://compras.acerto.com.br/api/auth/callback/google` | `https://sandbox-compras.acerto.com.br/api/auth/callback/google` |

O redirecionamento precisa bater **exatamente**, incluindo o `https` e sem
barra no fim. É a causa mais comum de erro no primeiro login.

---

## 3. Projetos na Vercel

Crie os dois projetos apontando para o mesmo repositório do GitHub.

No projeto **Sandbox**, mude a branch de produção para uma branch própria (por
exemplo `sandbox`), ou aceite que os dois publicam da `main`. As duas opções
funcionam; a primeira permite testar código antes de a Produção vê-lo, que é
metade do motivo de existir um Sandbox.

---

## 4. Variáveis de ambiente

A tabela abaixo é a parte que mais erra. Leia a coluna do Sandbox com atenção:
**vazio é uma configuração**, não um esquecimento.

| Variável | Produção | Sandbox |
|---|---|---|
| `APP_ENV` | `producao` | `sandbox` |
| `DATABASE_URL` | banco de produção | banco de sandbox, com `sandbox` no nome |
| `NEXTAUTH_SECRET` | valor próprio, gerado agora | **valor diferente**, gerado agora |
| `NEXTAUTH_URL` | `https://compras.acerto.com.br` | `https://sandbox-compras.acerto.com.br` |
| `APP_URL` | igual à de cima | igual à de cima |
| `GOOGLE_CLIENT_ID` | cliente de produção | cliente do sandbox |
| `GOOGLE_CLIENT_SECRET` | idem | idem |
| `AI_KEY_ENCRYPTION_SECRET` | valor próprio | **valor diferente** |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | conta de serviço | **vazio** |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | chave | **vazio** |
| `GMAIL_SENDER` | `compras@acerto.com.br` | **vazio** |
| `EMAIL_CONTROLADORIA` | caixa da Controladoria | **vazio** |
| `SLACK_BOT_TOKEN` | token do bot | **vazio** |
| `SLACK_SIGNING_SECRET` | signing secret | **vazio** |
| `BLOB_READ_WRITE_TOKEN` | store de produção | store do sandbox |
| `CRON_SECRET` | valor próprio | **valor diferente** |
| `ERP_API_KEY` | valor próprio | **valor diferente** |
| `ANTHROPIC_MODEL` | mesmo valor | mesmo valor |
| `GEMINI_MODEL` | mesmo valor | mesmo valor |
| `DASHBOARD_SAVING_TARGET_PCT` | `10` | `10` |
| `LOCAL_BYPASS_AUTH` | **não definir** | **não definir** |

Três regras que valem mais que a tabela:

**Nunca reaproveite um valor.** Se você se pegar copiando um segredo de uma
coluna para a outra, pare: é incidente, não atalho. `NEXTAUTH_SECRET` igual nos
dois significa que um cookie de sessão do Sandbox é aceito pela Produção.

**As credenciais de envio ficam vazias no Sandbox de propósito.** A trava de
código já bloqueia o envio fora de produção, mas ela é a segunda barreira. A
primeira é não haver credencial para usar.

**`AI_KEY_ENCRYPTION_SECRET` diferente é o que impede um dump de produção
restaurado no Sandbox de entregar as chaves pessoais de IA das pessoas.** Com a
mesma chave, o Sandbox decifra tudo.

---

## 5. Primeiro deploy

Na ordem, para cada projeto:

1. Publique.
2. Rode as migrations contra o banco daquele projeto:
   `npx prisma migrate deploy`, com `DATABASE_URL` do ambiente no comando.
   Use **sempre** `migrate deploy`, nunca `migrate dev`: o segundo é para a
   máquina local e pode reescrever histórico.
3. **Só no Sandbox**, popule com dados fictícios: `npm run prisma:seed`. O seed
   cria 22 pessoas em `@exemplo.invalid`, um domínio reservado que nunca
   resolve em DNS, então um envio acidental morre antes de sair.
   **Não rode o seed contra produção.** Ele é bloqueado pela guarda de banco,
   mas mesmo liberado criaria usuários fictícios que ninguém consegue logar.

---

## 6. Primeiro administrador em Produção

O seed não serve para isso (as pessoas são fictícias e o SSO exige
`@acerto.com.br`). O caminho é:

1. Entre em `https://compras.acerto.com.br` com sua conta corporativa. O login
   cria seu usuário com o papel Solicitante.
2. Conceda `ADMIN` a si mesmo, uma vez, direto no banco. O
   `CHECKLIST-GOOGLE-OAUTH.md` tem o SQL pronto.
3. A partir daí, todos os outros acessos saem de `/admin/acessos`.

---

## 7. Conferência: prove que a separação funcionou

Não pule. Cada item aqui corresponde a uma ameaça que a análise identificou.

- [ ] Abrir os dois endereços lado a lado. **Só o Sandbox mostra a faixa.** Se
      os dois mostrarem, `APP_ENV` não chegou na Produção. Se nenhum mostrar,
      chegou errado no Sandbox. Vale em qualquer tela, inclusive na de login e
      na página inicial: a faixa fica no layout raiz (`src/app/layout.tsx`), não
      na casca de Compras.
- [ ] Olhar o título das duas abas, sem trocar de aba. **Só o Sandbox traz
      `[SANDBOX] Acerto Compras`.** É a única diferença visível quando as duas
      estão abertas lado a lado e a faixa ainda não está à vista.
- [ ] No Sandbox, criar uma solicitação de teste e avançar uma etapa que
      notifica. **Nenhum e-mail pode chegar a ninguém.** Confira o registro de
      notificação: deve constar como bloqueado.
- [ ] Na Produção, confirmar que um e-mail real **sai**. A trava errada para o
      lado oposto deixa a Produção muda, e isso é tão ruim quanto.
- [ ] Conferir no log de cada projeto que o campo `ambiente` traz o valor certo.
      Se a Produção se identificar como sandbox, `APP_ENV` veio com espaço ou
      caixa diferente.
- [ ] Trocar deliberadamente a `DATABASE_URL` do Sandbox pela de produção e
      publicar. **O boot tem que falhar** com mensagem sobre marca de sandbox
      no nome do banco. Desfaça em seguida. Este é o teste que prova a barreira
      mais importante.
- [ ] Subir um anexo em cada ambiente e confirmar que aparecem em stores
      diferentes.
- [ ] Apontar o agendador de cron **só para a Produção**. O do Sandbox pode ser
      chamado à mão quando você quiser testar.

---

## O que este runbook não cobre

**Túnel local.** Um proxy (`cloud-sql-proxy`, proxy do Neon, `ssh -L`) faz um
banco remoto parecer `localhost`, e a guarda que protege o seed e os testes
confere host, não identidade do banco. Se você abrir um túnel para produção na
sua máquina, a guarda libera. Não há solução por código: a regra é não abrir
túnel para produção na mesma máquina onde se roda seed ou teste.

**Promoção, aprovação e rollback.** Não estão aqui de propósito. Commit é
versão com autor, data e motivo; a Vercel faz rollback instantâneo para o
deploy anterior e registra quem publicou. Construir isso dentro do alAi seria
reimplementar pior o que o git e o provedor já fazem.

**Cópia de dados de produção para o Sandbox.** Não faça. O Sandbox nasce vazio
e é povoado pelo seed sintético. Se algum dia for inevitável, a restauração
precisa, no mesmo passo, zerar as chaves de IA, reescrever todos os e-mails
para um domínio inexistente e zerar as URLs de anexo. Esse script não existe.
