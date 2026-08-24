# Migrations pra Golden Pipeline

Esta pasta contém uma **cópia plana** de cada migration do Prisma — é o que
a Golden Pipeline realmente lê e aplica no banco (via `dbMigrations` no
`.forge-config.yml`). O Prisma continua usando `prisma/migrations/`
normalmente pra tudo o que já faz hoje; esta pasta existe só porque a
Golden Pipeline espera arquivos `.sql` soltos, com nome único, direto num
diretório — e o Prisma nomeia **todo** arquivo de migration exatamente
`migration.sql` (só a pasta que muda), o que colide se apontarmos ela
direto pra `prisma/migrations/`.

## Sempre que criar uma migration nova

```bash
npx prisma migrate dev --name minha-mudanca   # 1. gera a migration do Prisma (fluxo normal, sem mudança)
npm run migrations:sync                        # 2. copia pra este diretório, com nome plano
git add prisma/migrations sql/acerto-compras   # 3. comita os dois JUNTOS, no mesmo commit/PR
```

## ⚠️ Se esquecer o passo 2 (ou 3)

**A migration não chega no banco — sem erro, sem aviso.** A Golden Pipeline
detecta o que aplicar olhando o que mudou em `sql/acerto-compras/` no
commit que está sendo implantado (via `git diff`). Se esse arquivo não
existir ali, ela simplesmente não vê nada de novo pra rodar — silenciosamente.

Isso já causou **2 incidentes reais** no `acerto-metrics-backend` (que usa o
mesmo mecanismo, só que com EF Core em vez de Prisma) exatamente por esse
motivo. Antes de dar merge, confirme que o arquivo novo apareceu aqui:

```bash
git status sql/acerto-compras/
```

## Por que não é automático

Foi uma decisão deliberada: manter o mesmo formato/risco que os outros
apps da Acerto já usam com esse mecanismo (`acerto-blocklist`,
`acerto-credito-poc-backend`, `acerto-metrics-backend`) — nenhum deles tem
esse passo automatizado hoje. Trocar isso exigiria alterar
`db-migrations.js` no `acerto-golden-pipeline` (mecanismo compartilhado,
usado em produção pelos 3 apps citados) ou adicionar um git hook local
(Husky) — nenhuma das duas foi adotada por ora.

## O que NUNCA fazer

**Não edite um arquivo já commitado nesta pasta.** Diferente do EF Core
(que verifica no próprio banco se a migration já rodou antes de reaplicar),
este mecanismo decide o que rodar só pelo `git diff` — editar um arquivo
antigo faz a Golden Pipeline tentar reaplicá-lo, sem checar se aquilo já
existe no banco. Precisando corrigir algo já aplicado, crie uma migration
nova (`prisma migrate dev`) que ajusta o que for necessário.
