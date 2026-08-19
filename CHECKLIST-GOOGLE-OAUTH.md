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
   - **Authorized redirect URIs**: adicionar uma entrada por ambiente que vai existir.
     - Produção: `https://<seu-domínio-de-produção>/api/auth/callback/google`
     - Staging (se houver): `https://<seu-domínio-de-staging>/api/auth/callback/google`
     - Local (dev, opcional, só quem for testar SSO localmente): `http://localhost:3000/api/auth/callback/google`
   - Salvar → copiar **Client ID** e **Client Secret**.

## 2. Variáveis de ambiente (produção)

Preencher no ambiente de produção (Railway/Render/etc.), e nunca commitar:

| Variável | Valor |
|---|---|
| `GOOGLE_CLIENT_ID` | do passo 1 |
| `GOOGLE_CLIENT_SECRET` | do passo 1 |
| `NEXTAUTH_URL` | URL pública real, ex: `https://compras.acerto.com.br` |
| `APP_URL` | mesma URL pública |
| `NEXTAUTH_SECRET` | gerar um valor **novo e único** para produção com `openssl rand -base64 32`. Nunca reaproveitar o de dev |
| `LOCAL_BYPASS_AUTH` | **remover a variável ou definir como `"false"`**, pois é isso que liga o SSO de verdade (ver `src/middleware.ts`) |

## 3. Garantir pelo menos um ADMIN antes de desligar o bypass

Sem isso, ninguém consegue acessar `/admin/acessos` para liberar as outras pessoas depois do primeiro login.

- `prisma/seed.ts` já cadastra pessoas reais da Acerto com papéis reais (ex:
  `alan.rabelo@acerto.com.br` como `ADMIN`). Rodar `npm run prisma:seed`
  contra o banco de produção **antes** do primeiro login cobre isso
  automaticamente (é um `upsert` por e-mail, seguro rodar mais de uma vez).
- Revisar essa lista antes de rodar em produção, porque hoje são pessoas/papéis
  citados no documento de referência, não confirmados como definitivos (ver
  também os `extraRoles` de Coordenação/Gerente F&NC, marcados como
  assunção não verificada).

## 4. Teste do fluxo completo (antes de desligar o bypass em definitivo)

1. Com `LOCAL_BYPASS_AUTH="false"` num ambiente de staging (não produção direto):
   - Login com uma conta `@acerto.com.br` → deve criar/reconhecer o `User` (signIn callback em `src/lib/auth.ts`).
   - Login com uma conta fora do domínio → deve ser recusado (checar `hd`/validação do e-mail no callback).
   - Conta desativada (`User.active = false`) → deve ser bloqueada mesmo com login Google válido.
2. Confirmar que `/admin/acessos` está acessível para quem tem papel `ADMIN` e bloqueado para os demais.
3. Confirmar que `/solicitacoes`, `/contratos`, `/dashboards` respeitam `canViewBoard` (middleware, `src/middleware.ts`).

## 5. Pendência documentada (não é bloqueio técnico, é aprovação)

- **Assunção não verificada** (já no README): confirmar com **Rafael Martins (SI e Privacidade)** se apps internos podem usar OAuth do Workspace sem passar por processo de aprovação do Google Admin. Fazer essa confirmação em paralelo aos passos acima, já que não impede configurar, mas precisa estar resolvido antes do go-live real.

## 6. Depois que o SSO estiver validado

- Remover de vez `LOCAL_BYPASS_AUTH` do `.env` de produção (não deixar como `"false"` residual, porque é melhor nem existir a variável lá).
- Nesse momento faz sentido também endurecer as rotas de API que hoje confiam em `actorId` vindo do corpo da requisição (ver item separado de segurança/arquitetura), sendo que o SSO é o pré-requisito para isso funcionar de verdade.
