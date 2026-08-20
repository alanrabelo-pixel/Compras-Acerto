import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createTestUser, createTestCostCenter, cleanupTestData, TEST_PREFIX } from "@/test-helpers/fixtures";

/**
 * Regressão das LISTAGENS DE CADASTRO: fornecedores, usuários e centros de
 * custo.
 *
 * Nenhuma das três tinha autorização além do middleware, que só exige uma
 * sessão @acerto.com.br. Duas passam a exigir o quadro e uma continua aberta
 * de propósito, e este arquivo trava as três decisões, não só as duas
 * restrições: exceção sem teste é exceção que alguém fecha sem perceber e só
 * descobre quando o formulário de Nova Solicitação para de abrir compra.
 *
 * O que estava exposto para qualquer conta da empresa:
 *
 * - /api/suppliers devolve o Supplier inteiro, e Supplier não é catálogo. Traz
 *   a avaliação interna de risco que a Acerto faz do terceiro (riskTier,
 *   approvedVendor, screeningStatus, screeningNotes) e o contato comercial.
 * - /api/users devolve nome, e-mail e PAPÉIS de todo mundo ativo. É o mapa de
 *   quem aprova, quem compra e quem é do Jurídico, pronto para quem quiser
 *   saber por onde pressionar uma compra.
 * - /api/cost-centers é a que fica aberta: sem ela ninguém escolhe centro de
 *   custo em /solicitacoes/nova, tela que qualquer colaborador abre.
 *
 * Um arquivo só para o grupo, pelo mesmo motivo do
 * requests/[id]/leituras.auth.test.ts: o Vitest roda arquivos em paralelo
 * contra o mesmo Postgres de desenvolvimento, então um processo, um cenário,
 * uma limpeza.
 *
 * Por que separado dos route.test.ts vizinhos: a suíte roda com
 * LOCAL_BYPASS_AUTH="true" (vem do .env via vitest.config.ts), e essa flag faz
 * as guardas de src/lib/acesso.ts liberarem tudo. Um teste de autorização
 * escrito naquele arquivo passaria sem exercer nada. Aqui a flag é desligada e
 * getServerSession é mockado, que é o caminho real de produção.
 */

type SessaoFalsa = {
  user: { id?: string; email?: string | null; roles?: string[]; canViewBoard?: boolean };
} | null;

const session = vi.hoisted(() => ({ current: null as SessaoFalsa }));

vi.mock("next-auth", () => ({
  getServerSession: async () => session.current,
}));

const { GET: getSuppliers } = await import("./suppliers/route");
const { GET: getUsers } = await import("./users/route");
const { GET: getCostCenters } = await import("./cost-centers/route");

function getRequest(caminho: string) {
  return new NextRequest(`http://localhost/api/${caminho}`, { method: "GET" });
}

/**
 * Monta a sessão do jeito que o callback session() de src/lib/auth.ts monta em
 * produção: id, papéis e canViewBoard vêm das colunas do banco a cada
 * chamada, e uma pessoa desativada sai sem id. Escrever o objeto na mão em
 * cada teste deixaria passar um cenário que a produção nunca produz.
 */
async function sessaoDe(userId: string): Promise<SessaoFalsa> {
  const dbUser = await prisma.user.findUnique({ where: { id: userId }, include: { roles: true } });
  if (!dbUser || !dbUser.active) {
    return { user: { id: undefined, email: dbUser?.email, roles: [], canViewBoard: false } };
  }
  return {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      roles: dbUser.roles.map((r) => r.role),
      canViewBoard: dbUser.canViewBoard,
    },
  };
}

/**
 * `intruso` tem SOLICITANTE, papel que não liga canViewBoard: é o colaborador
 * comum, que abre solicitação e chamado e nada além disso. `doQuadro` é a
 * Controladoria com a coluna canViewBoard marcada, que é o que /admin/acessos
 * grava ao conceder o acesso ao quadro.
 *
 * O fornecedor de teste tem risco e triagem preenchidos para o caso de recusa
 * poder provar que nada disso saiu junto com o 403, em vez de só conferir o
 * código de status.
 */
let fornecedoresCriados = 0;

async function cenario() {
  const intruso = await createTestUser(["SOLICITANTE"]);
  const doQuadro = await createTestUser(["CONTROLADORIA"]);
  await prisma.user.update({ where: { id: doQuadro.id }, data: { canViewBoard: true } });

  const centroDeCusto = await createTestCostCenter();
  // Supplier.cnpj é único e cada teste monta o cenário do zero, então o
  // contador evita colisão entre um teste e o seguinte deste mesmo arquivo.
  fornecedoresCriados += 1;
  const fornecedor = await prisma.supplier.create({
    data: {
      legalName: `Fornecedor Sigiloso ${TEST_PREFIX} Ltda`,
      cnpj: `${TEST_PREFIX}cnpj${fornecedoresCriados}`,
      tradeName: "Sigiloso",
      contactEmail: "comercial@fornecedorsigiloso.com.br",
      riskTier: "ALTO",
      screeningStatus: "REPROVADO",
      screeningNotes: "Reprovado na triagem interna de segurança da informação.",
    },
  });

  return { intruso, doQuadro, centroDeCusto, fornecedor };
}

describe("Listagens de cadastro: autorização", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");
    session.current = null;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    // cleanupTestData() não conhece Supplier. O filtro é pelo TEST_PREFIX deste
    // módulo, para não encostar no que outro arquivo de teste estiver criando
    // em paralelo no mesmo banco de desenvolvimento.
    await prisma.supplier.deleteMany({ where: { legalName: { contains: TEST_PREFIX } } });
    await cleanupTestData();
  });

  describe("GET /api/suppliers", () => {
    it("deixa o colaborador sem quadro consultar o cadastro, mas sem a avaliação de risco", async () => {
      // A rota NÃO é restrita ao quadro, e isso é deliberado: o mesmo
      // SupplierPicker é usado no formulário de envio de NDA, aberto a
      // qualquer colaborador. Uma versão anterior aplicou exigirQuadro aqui e
      // tirava o formulário do ar para quem ele existe para atender. O que é
      // restrito é o julgamento interno da Acerto sobre o terceiro.
      const { intruso, fornecedor } = await cenario();
      session.current = await sessaoDe(intruso.id);

      const res = await getSuppliers(getRequest(`suppliers?q=${TEST_PREFIX}`));

      expect(res.status).toBe(200);
      const lista = (await res.json()) as Record<string, unknown>[];
      expect(lista.map((s) => s.id)).toContain(fornecedor.id);

      const achado = lista.find((s) => s.id === fornecedor.id)!;
      expect(achado).not.toHaveProperty("screeningStatus");
      expect(achado).not.toHaveProperty("approvedVendor");
      expect(achado).not.toHaveProperty("riskTier");
      // O cadastro que o seletor precisa continua vindo.
      expect(achado.legalName).toBeTruthy();
    });

    it("não vaza a avaliação de risco nem no texto cru da resposta", async () => {
      const { intruso } = await cenario();
      session.current = await sessaoDe(intruso.id);

      const corpo = await (await getSuppliers(getRequest(`suppliers?q=${TEST_PREFIX}`))).text();

      expect(corpo).not.toContain("REPROVADO");
    });

    it("quem vê o quadro recebe o cadastro COM a avaliação de risco", async () => {
      const { doQuadro, fornecedor } = await cenario();
      session.current = await sessaoDe(doQuadro.id);

      const res = await getSuppliers(getRequest(`suppliers?q=${TEST_PREFIX}`));

      expect(res.status).toBe(200);
      const lista = (await res.json()) as Record<string, unknown>[];
      const achado = lista.find((s) => s.id === fornecedor.id);
      expect(achado).toBeDefined();
      // É o comprador que precisa da triagem para decidir o Pedido de Compra:
      // sem estes três campos o aviso de fornecedor pendente some da tela.
      expect(achado).toHaveProperty("screeningStatus");
      expect(achado).toHaveProperty("approvedVendor");
      expect(achado).toHaveProperty("riskTier");
    });

    it("quem foi desativado não recebe a avaliação de risco", async () => {
      // A porta que barra alguém desativado é o middleware, que devolve 401 em
      // /api/* quando o token vem com desativado. Aqui, sem middleware, o que
      // se garante é que a sessão inválida não vale como quadro: o cadastro
      // básico sai, o julgamento interno não.
      const { doQuadro } = await cenario();
      await prisma.user.update({ where: { id: doQuadro.id }, data: { active: false } });
      session.current = await sessaoDe(doQuadro.id);

      const res = await getSuppliers(getRequest(`suppliers?q=${TEST_PREFIX}`));

      expect(res.status).toBe(200);
      const lista = (await res.json()) as Record<string, unknown>[];
      if (lista.length > 0) expect(lista[0]).not.toHaveProperty("screeningStatus");
    });
  });

  describe("GET /api/users", () => {
    it("recusa com 403 o colaborador que não vê o quadro, sem vazar a lista de pessoas e papéis", async () => {
      const { intruso, doQuadro } = await cenario();
      session.current = await sessaoDe(intruso.id);

      const res = await getUsers(getRequest("users"));

      expect(res.status).toBe(403);
      const corpo = await res.text();
      expect(corpo).not.toContain(doQuadro.email);
      expect(corpo).not.toContain("CONTROLADORIA");
    });

    it("recusa com 403 mesmo quando o filtro por papel é o que interessa ao atacante", async () => {
      const { intruso, doQuadro } = await cenario();
      session.current = await sessaoDe(intruso.id);

      const res = await getUsers(getRequest("users?role=CONTROLADORIA"));

      expect(res.status).toBe(403);
      expect(await res.text()).not.toContain(doQuadro.email);
    });

    it("recusa com 401 quando não há sessão nenhuma", async () => {
      await cenario();
      session.current = null;

      const res = await getUsers(getRequest("users"));

      expect(res.status).toBe(401);
    });

    it("deixa passar quem vê o quadro, e a resposta traz os seletores de usuário", async () => {
      const { doQuadro } = await cenario();
      session.current = await sessaoDe(doQuadro.id);

      const res = await getUsers(getRequest("users"));

      expect(res.status).toBe(200);
      const lista = (await res.json()) as { id: string }[];
      expect(lista.map((u) => u.id)).toContain(doQuadro.id);
    });
  });

  /**
   * A exceção registrada em EXCECOES de autorizacao.cobertura.test.ts. Fechar
   * esta rota não daria erro em teste nenhum, só deixaria o campo obrigatório
   * Centro de Custo Gerencial vazio para quem não vê o quadro, que é
   * exatamente o público de /solicitacoes/nova. O teste existe para essa
   * quebra aparecer aqui e não em produção.
   */
  describe("GET /api/cost-centers (exceção consciente: formulário de Nova Solicitação)", () => {
    it("continua aberta ao colaborador comum, que precisa dela para abrir uma compra", async () => {
      const { intruso, centroDeCusto } = await cenario();
      session.current = await sessaoDe(intruso.id);

      const res = await getCostCenters();

      expect(res.status).toBe(200);
      const lista = (await res.json()) as { id: string; name: string }[];
      expect(lista.map((cc) => cc.id)).toContain(centroDeCusto.id);
    });

    it("devolve só id, nome e o nome do gestor, nada além do que o formulário usa", async () => {
      const { intruso, centroDeCusto } = await cenario();
      session.current = await sessaoDe(intruso.id);

      const res = await getCostCenters();
      const lista = (await res.json()) as Record<string, unknown>[];
      const meu = lista.find((cc) => cc.id === centroDeCusto.id);

      expect(meu).toBeDefined();
      expect(Object.keys(meu!).sort()).toEqual(["id", "managers", "name"]);
    });
  });
});
