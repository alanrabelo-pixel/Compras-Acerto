import { describe, it, expect, afterAll, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { CATEGORIA_COMPROVANTE_FPA } from "@/lib/orcamento-extra";
import { createTestUser, createTestCostCenter, createTestRequest, cleanupTestData, TEST_PREFIX } from "@/test-helpers/fixtures";

/**
 * Duas coisas que só existiam na cabeça de quem construiu o sistema e não
 * apareciam em tela nenhuma:
 *
 * 1. QUE AMBIENTE É ESTE. Com Produção e Sandbox em dois projetos separados na
 *    Vercel, as duas telas são idênticas. Quem abre a errada não tem como
 *    saber, e o Sandbox é justamente o ambiente onde nada sai (nem e-mail nem
 *    Slack, ver src/lib/ambiente.ts). A faixa nasceu aqui, na casca das telas
 *    de Compras (AppShell), e de lá alcançava 11 das 17 telas. Hoje ela mora
 *    no RootLayout, que alcança todas; o que sobrou deste lado é a garantia de
 *    que a casca NÃO a desenha de novo, senão as telas de Compras teriam duas.
 *    O comportamento da faixa está em
 *    src/app/faixa-de-ambiente-em-todas-as-telas.test.ts.
 *
 * 2. QUE A SOLICITAÇÃO É EXTRA-ORÇAMENTÁRIA e que falta o comprovante do FP&A.
 *    A regra já era cobrada nas portas de saída (aprovação do gestor e os dois
 *    ramos da validação orçamentária, ver src/lib/orcamento-extra.ts), mas a
 *    tela não dizia nada: o gestor descobria clicando em aprovar e tomando um
 *    422.
 *
 * Como isto é testado sem navegador: AppShell e a página são Server Components
 * assíncronos, então dá para chamá-los como função e inspecionar a árvore de
 * elementos que eles devolvem. Os componentes filhos não são executados (são
 * descritores), o que é suficiente aqui: o que está sob teste é o que a casca e
 * a página decidem mostrar, não o HTML final.
 */

// getServerSession lê cookies/headers do escopo de requisição do Next, que não
// existe fora do servidor. Sessão não é o assunto deste arquivo.
vi.mock("next-auth", () => ({
  getServerSession: async () => null,
  default: () => ({}),
}));

const { AppShell } = await import("@/components/AppShell");
const { default: TelaDaSolicitacao } = await import("./page");

type Elemento = { type: unknown; props: Record<string, unknown> };

function ehElemento(no: unknown): no is Elemento {
  return typeof no === "object" && no !== null && "props" in no && "type" in no;
}

/** Todo o texto que a árvore renderizaria, na ordem em que aparece. */
function textoDaArvore(no: unknown): string {
  if (no === null || no === undefined || typeof no === "boolean") return "";
  if (typeof no === "string" || typeof no === "number") return String(no);
  if (Array.isArray(no)) return no.map(textoDaArvore).join(" ");
  if (ehElemento(no)) return textoDaArvore(no.props.children);
  return "";
}

/** Todos os elementos da árvore, para conferir props que não são texto. */
function elementosDaArvore(no: unknown, acumulado: Elemento[] = []): Elemento[] {
  if (Array.isArray(no)) {
    for (const filho of no) elementosDaArvore(filho, acumulado);
    return acumulado;
  }
  if (ehElemento(no)) {
    acumulado.push(no);
    elementosDaArvore(no.props.children, acumulado);
  }
  return acumulado;
}

describe("A casca de Compras não redesenha a faixa de ambiente", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("não desenha faixa nenhuma no Sandbox: quem desenha é o RootLayout", async () => {
    vi.stubEnv("APP_ENV", "sandbox");

    const arvore = await AppShell({ children: null });
    const texto = textoDaArvore(arvore);

    // Se voltar a desenhar aqui, as 11 telas de Compras mostram duas faixas
    // empilhadas, e a de baixo tapa o topo do conteúdo (a de cima é fixed e a
    // compensação de espaço só devolve a altura de uma).
    expect(texto).not.toContain("SANDBOX");
    expect(texto).not.toContain("não é produção");
    // A compensação de espaço agora vem da classe que o RootLayout põe no
    // <body>; a casca voltou a ter uma classe só (ver globals.css).
    expect((arvore as Elemento).props.className).toBe("app-shell");
  });

  it("continua sem faixa em produção, onde ela não existe em lugar nenhum", async () => {
    vi.stubEnv("APP_ENV", "producao");

    const arvore = await AppShell({ children: null });

    expect(textoDaArvore(arvore)).not.toContain("SANDBOX");
    expect((arvore as Elemento).props.className).toBe("app-shell");
  });

  it("não quebra a casca em nenhum dos dois ambientes: barra lateral e conteúdo continuam lá", async () => {
    for (const ambiente of ["sandbox", "producao"]) {
      vi.stubEnv("APP_ENV", ambiente);

      const arvore = await AppShell({ active: "/solicitacoes", children: "conteúdo da tela" });
      const elementos = elementosDaArvore(arvore);

      expect(elementos.some((e) => e.props.className === "sidebar")).toBe(true);
      expect(elementos.some((e) => e.props.className === "app-content")).toBe(true);
      expect(textoDaArvore(arvore)).toContain("conteúdo da tela");
    }
  });
});

async function cenario(params: { extraBudget: boolean; comComprovante: boolean }) {
  const solicitante = await createTestUser([]);
  const gestor = await createTestUser(["APROVADOR"]);
  const costCenter = await createTestCostCenter();
  const req = await createTestRequest({
    requesterId: solicitante.id,
    approverManagerId: gestor.id,
    costCenterId: costCenter.id,
    currentStage: "APROVACAO_GESTOR",
    estimatedValue: 20000,
  });
  if (params.extraBudget) {
    await prisma.purchaseRequest.update({ where: { id: req.id }, data: { extraBudget: true } });
  }
  if (params.comComprovante) {
    await prisma.attachment.create({
      data: {
        requestId: req.id,
        category: CATEGORIA_COMPROVANTE_FPA,
        fileName: `aprovacao-fpa-${TEST_PREFIX}.pdf`,
        storageUrl: "local://teste/aprovacao-fpa.pdf",
        uploadedBy: solicitante.id,
      },
    });
  }
  return { req, solicitante };
}

describe("Tela da solicitação: extra-orçamentária e comprovante do FP&A", () => {
  afterAll(async () => {
    const solicitacoes = await prisma.purchaseRequest.findMany({
      where: { code: { contains: TEST_PREFIX } },
      select: { id: true },
    });
    const ids = solicitacoes.map((s) => s.id);
    if (ids.length > 0) {
      await prisma.attachment.deleteMany({ where: { requestId: { in: ids } } });
    }
    await cleanupTestData();
  });

  it("avisa que é Orçamento Extra sem comprovante, dizendo o que fazer e quem faz", async () => {
    const { req, solicitante } = await cenario({ extraBudget: true, comComprovante: false });

    const arvore = await TelaDaSolicitacao({ params: { id: req.id } });
    const texto = textoDaArvore(arvore);

    // Que é extra-orçamentária.
    expect(texto).toContain("Orçamento Extra");
    // O que falta.
    expect(texto).toContain("comprovante de aprovação do FP&A");
    // O que fazer e quem faz.
    expect(texto).toContain("anexar o arquivo");
    expect(texto).toContain(solicitante.name);
    // Qual é a consequência de não fazer, que hoje só aparece no 422.
    expect(texto).toContain("a Aprovação do Gestor e a Validação Orçamentária não avançam");

    // Aviso sem saída não resolve nada: o painel genérico de Anexos grava tudo
    // como GERAL, então precisa existir um painel que grave a categoria que a
    // regra procura.
    const elementos = elementosDaArvore(arvore);
    expect(elementos.some((e) => e.props.category === CATEGORIA_COMPROVANTE_FPA)).toBe(true);
  });

  it("para de avisar quando o comprovante está anexado, e mostra qual é o arquivo", async () => {
    const { req } = await cenario({ extraBudget: true, comComprovante: true });

    const arvore = await TelaDaSolicitacao({ params: { id: req.id } });
    const texto = textoDaArvore(arvore);

    expect(texto).toContain("Orçamento Extra");
    expect(texto).toContain(`aprovacao-fpa-${TEST_PREFIX}.pdf`);
    expect(texto).not.toContain("a Aprovação do Gestor e a Validação Orçamentária não avançam");
  });

  it("não inventa aviso nenhum para quem informou linha de orçamento", async () => {
    const { req } = await cenario({ extraBudget: false, comComprovante: false });

    const arvore = await TelaDaSolicitacao({ params: { id: req.id } });
    const texto = textoDaArvore(arvore);

    expect(texto).not.toContain("Orçamento Extra");
    expect(texto).not.toContain("FP&A");
    expect(elementosDaArvore(arvore).some((e) => e.props.category === CATEGORIA_COMPROVANTE_FPA)).toBe(false);
  });
});
