import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mkdir, writeFile, rm } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import {
  createTestUser,
  createTestCostCenter,
  createTestRequest,
  cleanupTestData,
  TEST_PREFIX,
} from "@/test-helpers/fixtures";

/**
 * Regressão do download de anexo sem autorização nenhuma.
 *
 * A rota carregava o Attachment pelo id e devolvia o arquivo. Só isso. O
 * middleware garante uma sessão @acerto.com.br e nada mais, então qualquer
 * conta da empresa baixava proposta comercial de concorrente, contrato
 * escaneado e nota fiscal de qualquer solicitação ou chamado, bastando um id.
 *
 * O anexo não tem dono próprio: ou pertence a uma PurchaseRequest, ou a um
 * SimpleTicket. A guarda delega para a leitura do dono, e é por isso que o
 * caso do anexo de CHAMADO tem teste próprio aqui: ele cai em outro ramo
 * (exigirLeituraDeChamado, que casa por e-mail e não por FK) e é o mais fácil
 * de esquecer.
 *
 * Arquivo separado dos demais testes porque a suíte roda com
 * LOCAL_BYPASS_AUTH="true" (vem do .env via vitest.config.ts) e essa flag faz
 * toda checagem de src/lib/acesso.ts passar direto. Um teste de autorização
 * escrito com a flag ligada passaria sem exercer nada. Aqui ela é desligada e
 * getServerSession é mockado, que é o caminho real de produção.
 */

const session = vi.hoisted(() => ({
  current: null as { user: { id?: string; email?: string; roles?: string[]; canViewBoard?: boolean } } | null,
}));

vi.mock("next-auth", () => ({
  getServerSession: async () => session.current,
}));

const { GET } = await import("./route");

/**
 * Conteúdo reconhecível: além do status, cada teste de recusa confere que este
 * texto NÃO saiu na resposta. Status certo com o corpo vazando junto seria pior
 * do que inútil.
 */
const SEGREDO = "PROPOSTA COMERCIAL CONFIDENCIAL - R$ 487.000,00";

const PASTA_UPLOAD = `${TEST_PREFIX}anexos`;
const RAIZ_UPLOAD = path.join(process.cwd(), "uploads", PASTA_UPLOAD);

let seq = 0;
function proximo() {
  seq += 1;
  return `${TEST_PREFIX}${seq}`;
}

/**
 * Entra como a pessoa. A identidade vem toda da sessão (ver atorDaSessao em
 * src/lib/acesso.ts): id, e-mail, papéis e a coluna canViewBoard. Por padrão
 * sem acesso ao quadro, que é o recorte que interessa testar.
 */
function entrarComo(u: { id: string; email: string }, opcoes: { veQuadro?: boolean; papeis?: string[] } = {}) {
  session.current = {
    user: { id: u.id, email: u.email, roles: opcoes.papeis ?? [], canViewBoard: opcoes.veQuadro ?? false },
  };
}

/**
 * Cria o arquivo em disco DE VERDADE e o registro do anexo apontando para ele.
 * O arquivo existir importa: sem ele, o código antigo quebraria no readFile e a
 * recusa pareceria vir da guarda quando na verdade viria de um arquivo
 * faltando. Com ele, o código antigo devolve 200 com o conteúdo e o teste falha
 * dizendo exatamente isso.
 */
async function criarAnexo(vinculo: { requestId?: string; ticketId?: string }) {
  const nomeArquivo = `${proximo()}.txt`;
  await mkdir(RAIZ_UPLOAD, { recursive: true });
  await writeFile(path.join(RAIZ_UPLOAD, nomeArquivo), SEGREDO, "utf-8");

  return prisma.attachment.create({
    data: {
      requestId: vinculo.requestId,
      ticketId: vinculo.ticketId,
      fileName: nomeArquivo,
      storageUrl: `local://${PASTA_UPLOAD}/${nomeArquivo}`,
      uploadedBy: "upload@teste.acerto.com.br",
    },
  });
}

async function criarChamado(requesterEmail: string) {
  return prisma.simpleTicket.create({
    data: {
      code: `TST-${proximo()}`,
      category: "VIAGENS",
      requesterName: "Solicitante de Teste",
      requesterEmail,
      description: "Chamado gerado por teste de autorização.",
    },
  });
}

function baixar(id: string) {
  const req = new NextRequest(`http://localhost/api/attachments/${id}/file`);
  return GET(req, { params: { id } });
}

/** Confere que o arquivo não vazou junto com a recusa. */
async function naoVazou(res: Response) {
  expect(await res.text()).not.toContain(SEGREDO);
}

/** Anexo pendurado numa solicitação, mais o solicitante e um estranho. */
async function cenarioSolicitacao() {
  const solicitante = await createTestUser(["SOLICITANTE"]);
  const gestor = await createTestUser(["APROVADOR"]);
  // Estranho: autenticado, sem acesso ao quadro e sem vínculo nenhum com a
  // solicitação. É o perfil de quem hoje baixa tudo.
  const estranho = await createTestUser(["SOLICITANTE"]);
  const centroDeCusto = await createTestCostCenter();
  const solicitacao = await createTestRequest({
    requesterId: solicitante.id,
    approverManagerId: gestor.id,
    costCenterId: centroDeCusto.id,
    currentStage: "COTACAO",
    estimatedValue: 487000,
  });
  const anexo = await criarAnexo({ requestId: solicitacao.id });
  return { anexo, solicitante, estranho };
}

/** Anexo pendurado num chamado, mais o dono (por e-mail) e um estranho. */
async function cenarioChamado() {
  const dono = await createTestUser(["SOLICITANTE"]);
  const estranho = await createTestUser(["SOLICITANTE"]);
  const chamado = await criarChamado(dono.email);
  const anexo = await criarAnexo({ ticketId: chamado.id });
  return { anexo, dono, estranho };
}

describe("GET /api/attachments/[id]/file: autorização", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    session.current = null;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    // cleanupTestData() não cobre Attachment nem SimpleTicket, e o anexo tem FK
    // para PurchaseRequest: sem apagar os anexos ANTES, o delete das
    // solicitações lá dentro quebraria por violação de chave estrangeira.
    await prisma.attachment.deleteMany({ where: { fileName: { contains: TEST_PREFIX } } });
    await prisma.simpleTicket.deleteMany({ where: { code: { contains: TEST_PREFIX } } });
    await cleanupTestData();
    await rm(RAIZ_UPLOAD, { recursive: true, force: true });
  });

  it("recusa quem não é parte da solicitação nem tem acesso ao quadro", async () => {
    const { anexo, estranho } = await cenarioSolicitacao();
    entrarComo(estranho);

    const res = await baixar(anexo.id);

    expect(res.status).toBe(403);
    await naoVazou(res);
  });

  it("permite o solicitante baixar o anexo da própria solicitação", async () => {
    const { anexo, solicitante } = await cenarioSolicitacao();
    entrarComo(solicitante);

    const res = await baixar(anexo.id);

    expect(res.status).toBe(200);
    expect(await res.text()).toContain(SEGREDO);
  });

  it("recusa sem sessão nenhuma, com 401", async () => {
    const { anexo } = await cenarioSolicitacao();
    session.current = null;

    const res = await baixar(anexo.id);

    expect(res.status).toBe(401);
    await naoVazou(res);
  });

  // O ramo do chamado é o mais fácil de esquecer: SimpleTicket não tem FK para
  // User, o vínculo é o requesterEmail em texto livre.
  it("recusa quem não é dono do chamado nem tem acesso ao quadro", async () => {
    const { anexo, estranho } = await cenarioChamado();
    entrarComo(estranho);

    const res = await baixar(anexo.id);

    expect(res.status).toBe(403);
    await naoVazou(res);
  });

  it("permite o dono do chamado baixar o anexo dele", async () => {
    const { anexo, dono } = await cenarioChamado();
    entrarComo(dono);

    const res = await baixar(anexo.id);

    expect(res.status).toBe(200);
    expect(await res.text()).toContain(SEGREDO);
  });

  it("recusa sem sessão também no anexo de chamado, com 401", async () => {
    const { anexo } = await cenarioChamado();
    session.current = null;

    const res = await baixar(anexo.id);

    expect(res.status).toBe(401);
    await naoVazou(res);
  });

  it("permite quem tem acesso ao quadro, confirmando que a recusa acima é de autorização", async () => {
    const { anexo, estranho } = await cenarioSolicitacao();
    entrarComo(estranho, { veQuadro: true, papeis: ["COMPRADOR"] });

    const res = await baixar(anexo.id);

    expect(res.status).toBe(200);
    expect(await res.text()).toContain(SEGREDO);
  });

  it("nega anexo órfão, sem solicitação e sem chamado, mesmo para quem vê o quadro", async () => {
    // Falha fechado: sem dono não há a quem consultar, e liberar o que não dá
    // para verificar é o furo que a guarda existe para tapar.
    const anexo = await criarAnexo({});
    const admin = await createTestUser(["ADMIN"]);
    entrarComo(admin, { veQuadro: true, papeis: ["ADMIN"] });

    const res = await baixar(anexo.id);

    expect(res.status).toBe(403);
    await naoVazou(res);
  });

  it("recusa sessão sem id, que é como uma pessoa desativada aparece", async () => {
    // O callback session() de src/lib/auth.ts zera o id quando a pessoa perde o
    // acesso. É o que faz a revogação valer na hora, sem esperar o cookie expirar.
    const { anexo, solicitante } = await cenarioSolicitacao();
    session.current = { user: { email: solicitante.email, roles: ["SOLICITANTE"], canViewBoard: false } };

    const res = await baixar(anexo.id);

    expect(res.status).toBe(401);
    await naoVazou(res);
  });
});
