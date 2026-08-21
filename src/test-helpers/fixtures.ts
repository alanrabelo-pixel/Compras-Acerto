import { prisma } from "@/lib/db";
import type { RoleName, Diretoria, DemandType, Priority, Stage } from "@prisma/client";

/**
 * Fixtures para os testes de integração das rotas de alçada (ver
 * src/app/api/requests/[id]/*.test.ts). Roda contra o Postgres real de
 * desenvolvimento (não há banco de teste dedicado ainda, ver relatório de
 * modernização, item de escala), por isso todo registro criado aqui é
 * marcado com o prefixo TEST_PREFIX e removido no cleanup() do teste.
 *
 * LOCAL_BYPASS_AUTH="true" (ver .env) faz requireRole() pular a checagem de
 * sessão real e confiar no id enviado no corpo, o que permite chamar as
 * rotas diretamente aqui sem simular um cookie de sessão do NextAuth.
 */
// Escopado por MÓDULO (não por processo inteiro): o Vitest isola cada
// arquivo de teste em seu próprio grafo de módulos, então este valor
// aleatório é diferente por arquivo. Isso evita que o cleanup() de um arquivo
// apague os dados de outro arquivo rodando em paralelo (mesma base de dados
// de desenvolvimento, sem banco de teste dedicado ainda).
export const TEST_PREFIX = `__test_${Math.random().toString(36).slice(2, 8)}__`;

let counter = 0;
function uniqueSuffix() {
  counter += 1;
  return `${TEST_PREFIX}${counter}`;
}

export async function createTestUser(roles: RoleName[], overrides: Partial<{ name: string; diretoria: Diretoria }> = {}) {
  const suffix = uniqueSuffix();
  const user = await prisma.user.create({
    data: {
      name: overrides.name ?? `Usuário Teste ${suffix}`,
      email: `${suffix}@teste.acerto.com.br`,
      diretoria: overrides.diretoria,
      roles: { create: roles.map((role) => ({ role })) },
    },
  });
  return user;
}

export async function createTestCostCenter() {
  return prisma.costCenter.create({ data: { name: `Centro ${uniqueSuffix()}` } });
}

export async function createTestRequest(params: {
  requesterId: string;
  approverManagerId: string;
  buyerId?: string;
  costCenterId: string;
  currentStage: Stage;
  estimatedValue?: number;
  demandType?: DemandType;
  diretoria?: Diretoria;
  priority?: Priority;
  needsContract?: boolean;
}) {
  const suffix = uniqueSuffix();
  return prisma.purchaseRequest.create({
    data: {
      code: `TST-${suffix}`,
      requesterId: params.requesterId,
      approverManagerId: params.approverManagerId,
      buyerId: params.buyerId,
      costCenterId: params.costCenterId,
      currentStage: params.currentStage,
      estimatedValue: params.estimatedValue,
      demandType: params.demandType ?? "COMPRA_SERVICO",
      diretoria: params.diretoria ?? "TECNOLOGIA",
      priority: params.priority ?? "MEDIA",
      needsContract: params.needsContract ?? false,
      shortDescription: `Solicitação de teste ${suffix}`,
      longDescription: "Gerada por teste de integração automatizado.",
      quantity: 1,
      leadershipPreApproved: true,
      suggestedDeadline: new Date(Date.now() + 30 * 86_400_000),
    },
  });
}

/**
 * Remove todos os registros de teste (por prefixo em code/email); chamar em
 * afterAll/afterEach. Segue a ordem de dependência (filhos antes dos pais).
 *
 * POR QUE A LISTA É TÃO LONGA. Nenhuma relação deste schema tem onDelete:
 * Cascade, então apagar um pai com filho vivo levanta erro de chave
 * estrangeira. Como isto roda em afterAll, o erro derruba a limpeza no meio:
 * a solicitação não é apagada, e as linhas seguintes (usuário e centro de
 * custo) nunca chegam a rodar. Foi exatamente o que aconteceu, e o banco de
 * desenvolvimento acumulou 19 lotes de teste, 439 usuários e 93 centros de
 * custo órfãos, um centro por solicitação não apagada.
 *
 * Por isso a regra ao mexer aqui: TODA tabela nova que referencie
 * PurchaseRequest ou User precisa entrar nesta função. A conferência do fim
 * existe para avisar quando alguém esquecer, em vez de deixar o resíduo
 * crescer em silêncio até alguém abrir o Dashboard e ver o filtro poluído.
 *
 * Escopo por usuário, e não só por solicitação: um usuário de teste pode ser
 * aprovador ou autor de evento numa solicitação que não é de teste, e nesse
 * caso a varredura por requestId não o alcança.
 */
export async function cleanupTestData() {
  const requests = await prisma.purchaseRequest.findMany({
    where: { code: { contains: TEST_PREFIX } },
    select: { id: true },
  });
  const requestIds = requests.map((r) => r.id);
  const users = await prisma.user.findMany({
    where: { email: { contains: TEST_PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  if (requestIds.length > 0) {
    const doRequest = { requestId: { in: requestIds } };

    // Contrato antes da solicitação, e o alerta antes do contrato.
    const contratos = await prisma.contract.findMany({ where: doRequest, select: { id: true } });
    if (contratos.length > 0) {
      const contractIds = contratos.map((c) => c.id);
      await prisma.contractAlert.deleteMany({ where: { contractId: { in: contractIds } } });
      await prisma.contract.deleteMany({ where: { id: { in: contractIds } } });
    }

    await prisma.stageEvent.deleteMany({ where: doRequest });
    await prisma.approval.deleteMany({ where: doRequest });
    await prisma.conflictOfInterestDeclaration.deleteMany({ where: doRequest });
    await prisma.aiInsight.deleteMany({ where: doRequest });
    await prisma.requestChatMessage.deleteMany({ where: doRequest });
    await prisma.comment.deleteMany({ where: doRequest });
    await prisma.dueDiligenceReview.deleteMany({ where: doRequest });
    await prisma.quote.deleteMany({ where: doRequest });
    await prisma.legalReview.deleteMany({ where: doRequest });
    await prisma.measurement.deleteMany({ where: doRequest });
    await prisma.fiscalDocument.deleteMany({ where: doRequest });
    await prisma.payment.deleteMany({ where: doRequest });
    await prisma.supplierEvaluation.deleteMany({ where: doRequest });
    await prisma.notification.deleteMany({ where: doRequest });
    await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrder: doRequest } });
    await prisma.purchaseOrder.deleteMany({ where: doRequest });

    // BudgetException aponta para Attachment, então sai antes dele.
    await prisma.budgetException.deleteMany({ where: doRequest });
    await prisma.attachment.deleteMany({ where: doRequest });

    await prisma.purchaseRequest.deleteMany({ where: { id: { in: requestIds } } });
  }

  if (userIds.length > 0) {
    // Sobras que apontam para o usuário por fora de qualquer solicitação de
    // teste. Contrato de novo, aqui pelo gestor em vez da origem.
    const contratosGeridos = await prisma.contract.findMany({
      where: { contractManagerId: { in: userIds } },
      select: { id: true },
    });
    if (contratosGeridos.length > 0) {
      const ids = contratosGeridos.map((c) => c.id);
      await prisma.contractAlert.deleteMany({ where: { contractId: { in: ids } } });
      await prisma.contract.deleteMany({ where: { id: { in: ids } } });
    }

    await prisma.approvalLevelApprover.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.permissionChange.deleteMany({ where: { targetUserId: { in: userIds } } });
    await prisma.comment.deleteMany({ where: { authorId: { in: userIds } } });
    await prisma.approval.deleteMany({ where: { approverId: { in: userIds } } });
    await prisma.stageEvent.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.aiInsight.deleteMany({ where: { requestedById: { in: userIds } } });
  }

  await prisma.userRole.deleteMany({ where: { user: { email: { contains: TEST_PREFIX } } } });
  await prisma.user.deleteMany({ where: { email: { contains: TEST_PREFIX } } });
  await prisma.costCenter.deleteMany({ where: { name: { contains: TEST_PREFIX } } });

  await conferirQueNaoSobrou();
}

/**
 * Conferência final: relê o que deveria ter sumido. Existe porque a falha
 * anterior era silenciosa em produzir resíduo e barulhenta no lugar errado
 * (o erro de chave estrangeira apontava para a solicitação, não para a
 * tabela filha esquecida). Aqui a mensagem nomeia o que sobrou.
 */
async function conferirQueNaoSobrou() {
  const [solicitacoes, usuarios, centros] = await Promise.all([
    prisma.purchaseRequest.count({ where: { code: { contains: TEST_PREFIX } } }),
    prisma.user.count({ where: { email: { contains: TEST_PREFIX } } }),
    prisma.costCenter.count({ where: { name: { contains: TEST_PREFIX } } }),
  ]);

  const sobras = [
    solicitacoes > 0 ? `${solicitacoes} solicitação(ões)` : null,
    usuarios > 0 ? `${usuarios} usuário(s)` : null,
    centros > 0 ? `${centros} centro(s) de custo` : null,
  ].filter(Boolean);

  if (sobras.length > 0) {
    throw new Error(
      `cleanupTestData deixou resíduo no banco (prefixo ${TEST_PREFIX}): ${sobras.join(", ")}. ` +
        "Alguma tabela nova referencia PurchaseRequest ou User e não foi incluída na limpeza.",
    );
  }
}
