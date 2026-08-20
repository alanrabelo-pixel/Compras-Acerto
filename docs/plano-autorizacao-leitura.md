# Plano: autorização nas rotas de leitura

Origem: mapeamento multi-agente de 2026-08-19, seis subsistemas, 31 suspeitas
confirmadas por revisor cético. A auditoria anterior fechou os caminhos de
escrita e não tocou nos de leitura. Este plano cobre essa frente.

Confirmados manualmente antes de virar plano:

| Rota | O que vaza hoje |
|---|---|
| `GET /api/attachments/[id]/file` | qualquer sessão baixa qualquer anexo, de qualquer solicitação ou chamado |
| `GET /api/contracts` | carteira inteira mais o `User` completo do gestor, incluindo as colunas de chave de IA |
| `GET /api/requests/[id]/ai-insight` | `include: { requestedBy: true }` devolve `anthropicApiKey` e `geminiApiKey` no JSON |
| `GET /api/tickets` e `GET /api/tickets/[id]` | chamados de qualquer pessoa, sem o recorte por e-mail que as telas aplicam |
| `POST /api/tickets` | nome e e-mail declarados no corpo, dá para abrir chamado em nome de outra pessoa |
| `PUT /api/approval-levels/[level]` | ao trocar aprovadores, todas as pendentes do nível apontam para a mesma pessoa |

O sistema ainda não está em produção. O prazo é antes do primeiro login real,
não emergencial, mas a chave de IA em texto puro dentro de resposta HTTP é o
tipo de coisa que não sobrevive a uma revisão de segurança depois.

---

## Prompt de execução

Cole o texto abaixo em uma sessão nova, no diretório do projeto.

---

Você vai fechar a frente de autorização nas rotas de leitura do alAi (Acerto
Compras), a partir de um mapeamento que já foi feito e verificado. O sistema é
Next.js 14 App Router com Prisma e PostgreSQL, em português do Brasil.

### Regras que não se negociam

- **Proibido qualquer comando que escreva no banco.** Nada de `prisma migrate`,
  `db push`, `seed`, nem script que chame `create`/`update`/`delete`. Se uma
  correção exigir migração, pare e peça autorização, explicando o que muda.
- **Não use script Node com template literal para editar arquivo.** Nesta base
  isso já falhou em silêncio várias vezes: o script imprime sucesso e não altera
  nada. Use a ferramenta Edit.
- **Nunca confie no relatório do próprio script.** Confirme toda alteração com
  uma busca independente no código depois de aplicá-la.
- `npx tsc --noEmit; echo "exit: $?"` (com o `echo`, porque cano zera o código de
  saída) e `npx vitest run` precisam passar antes de cada commit.
- Sem travessão (o caractere de traço longo) em nenhum texto, nem em comentário.
  A marca é exatamente `alAi`.
- Commit e `git push origin master:main` a cada correção fechada, sem perguntar.
- Comentário de código explica **por que** aquilo estava errado, no tom do resto
  da base: direto, sem elogio, dizendo o que quebrava na prática.

### Etapa 1: inventário exaustivo antes de corrigir nada

Liste **todo** handler `GET` em `src/app/api/**` e, para cada um, registre:

1. Que autorização ele aplica hoje (nenhuma, só sessão, papel, dono do registro).
2. Se usa `include` sem `select`, e qual modelo ele arrasta junto.
3. Quem deveria poder ler aquilo, na regra de negócio.

O `src/middleware.ts` garante apenas que existe sessão em `/api/*` e diz por
escrito que autorização por papel é responsabilidade de cada rota. Trate
"tem sessão" como não autorizado.

Preste atenção especial a todo `include` que puxa `User`, porque o modelo tem
`anthropicApiKey` e `geminiApiKey`. **Nenhuma resposta de API pode conter essas
duas colunas, em hipótese nenhuma.** Vale procurar um jeito de tornar isso
estrutural, não uma lembrança de quem escreve a próxima rota.

Entregue o inventário e **pare para revisão** antes de corrigir.

### Etapa 2: correções, uma por vez

Ordem sugerida, da maior consequência para a menor:

1. Vazamento das chaves de IA em qualquer resposta.
2. `GET /api/attachments/[id]/file`: só quem participa da solicitação ou do
   chamado, mais os papéis que já enxergam aquele fluxo.
3. Chat da solicitação: leitura e escrita. Hoje qualquer autenticado lê a
   negociação e escreve como COMPRADOR com o nome que quiser, e isso espelha em
   DM no Slack.
4. Chamados: recorte por e-mail na listagem e no detalhe, e identidade do
   solicitante vinda da sessão, não do corpo do POST.
5. `GET /api/contracts` e demais listagens amplas.
6. `PUT /api/approval-levels/[level]`: a migração das pendentes não pode
   colapsar duas aprovações distintas na mesma pessoa.

Para cada uma: teste automatizado que falha antes e passa depois, no padrão de
`route.auth.test.ts` (mock de `next-auth`, `vi.stubEnv("LOCAL_BYPASS_AUTH","false")`,
porque a suíte principal roda com o desvio ligado).

### O que não fazer

- Não crie uma camada de autorização nova e genérica. Existe `requireRole` em
  `src/lib/rbac.ts` e o padrão de dono do registro já usado nas rotas de escrita.
  Siga o que está lá.
- Não mexa em painéis, front-end, criptografia de segredos nem no webhook do
  Slack. Essas áreas foram mapeadas e estão boas.
- Não altere nada só para mostrar serviço. Se uma rota já está correta, diga
  "manter como está" e siga.
