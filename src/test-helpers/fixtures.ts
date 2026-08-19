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
 */
export async function cleanupTestData() {
  const requests = await prisma.purchaseRequest.findMany({ where: { code: { contains: TEST_PREFIX } } });
  const requestIds = requests.map((r) => r.id);
  if (requestIds.length > 0) {
    await prisma.stageEvent.deleteMany({ where: { requestId: { in: requestIds } } });
    await prisma.approval.deleteMany({ where: { requestId: { in: requestIds } } });
    await prisma.budgetException.deleteMany({ where: { requestId: { in: requestIds } } });
    await prisma.conflictOfInterestDeclaration.deleteMany({ where: { requestId: { in: requestIds } } });
    await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { requestId: { in: requestIds } } } });
    await prisma.purchaseOrder.deleteMany({ where: { requestId: { in: requestIds } } });
    await prisma.purchaseRequest.deleteMany({ where: { id: { in: requestIds } } });
  }
  await prisma.userRole.deleteMany({ where: { user: { email: { contains: TEST_PREFIX } } } });
  await prisma.user.deleteMany({ where: { email: { contains: TEST_PREFIX } } });
  await prisma.costCenter.deleteMany({ where: { name: { contains: TEST_PREFIX } } });
}
