import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";

/**
 * A faixa de ambiente existia, mas só nas telas de Compras: ela morava no
 * AppShell, e seis telas não passam por ele. Ficavam sem aviso a página
 * inicial (porta de entrada de todo mundo), o login (a primeira tela que a
 * pessoa vê), o "sem acesso" e as três de Chamados.
 *
 * Chamados é a que dói: abrir um chamado dispara e-mail de confirmação (ver
 * src/app/api/tickets/route.ts) e fora de produção esse e-mail é engolido pela
 * trava de envio (src/lib/integrations/gmail.ts). Sem faixa, a pessoa abre o
 * chamado no Sandbox achando que é o sistema, não recebe nada, e o chamado
 * morre sem ninguém saber. Um aviso que cobre só parte das telas não é um aviso:
 * é uma armadilha, porque ensina que "sem faixa" significa produção.
 *
 * Por isso a faixa subiu para o RootLayout (src/app/layout.tsx), o único ponto
 * por onde todas passam.
 *
 * Este arquivo tem duas metades, e a segunda é a que importa mais:
 *
 * 1. COMPORTAMENTO: o que o RootLayout desenha em cada ambiente.
 * 2. LIGAÇÃO: que não sobrou tela fora e que ninguém redesenha a faixa por
 *    conta própria. O modo de falha aqui nunca foi "a faixa está errada", foi
 *    "a faixa não chega", e isso não se vê testando o componente sozinho.
 */

// next/font é resolvido pelo compilador do Next, não em tempo de execução:
// importado direto, o pacote não entrega função nenhuma.
//
// A entrada `next/font/local` chegou em 25/08/2026, quando o layout trocou a
// fonte do Google por um arquivo versionado no repositório (o build da Golden
// Pipeline não tem saída para fonts.gstatic.com e travava tentando baixar).
// Sem este mock, os cinco casos deste arquivo falham com "default is not a
// function", que não diz nada sobre o que eles testam.
vi.mock("next/font/google", () => ({
  Montserrat: () => ({ variable: "__variable_teste", className: "", style: {} }),
}));
vi.mock("next/font/local", () => ({
  default: () => ({ variable: "__variable_teste", className: "", style: {} }),
}));

const RAIZ = process.cwd();
const PASTA_APP = path.resolve(RAIZ, "src/app");

type Elemento = { type: unknown; props: Record<string, unknown> };

function ehElemento(no: unknown): no is Elemento {
  return typeof no === "object" && no !== null && "props" in no && "type" in no;
}

function textoDaArvore(no: unknown): string {
  if (no === null || no === undefined || typeof no === "boolean") return "";
  if (typeof no === "string" || typeof no === "number") return String(no);
  if (Array.isArray(no)) return no.map(textoDaArvore).join(" ");
  if (ehElemento(no)) return textoDaArvore(no.props.children);
  return "";
}

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

function corpo(arvore: unknown): Elemento {
  const body = elementosDaArvore(arvore).find((e) => e.type === "body");
  expect(body, "o RootLayout não desenhou um <body>").toBeTruthy();
  return body as Elemento;
}

/**
 * `metadata` é avaliado quando o módulo carrega, então cada ambiente precisa de
 * uma carga própria. É também o comportamento real: o título é resolvido uma
 * vez no servidor, com o APP_ENV daquele projeto da Vercel.
 */
async function carregarLayout() {
  vi.resetModules();
  return await import("./layout");
}

/** Todo arquivo de tela e de casca, recursivamente. */
function arquivosDoApp(sufixo: string, pasta = PASTA_APP, achados: string[] = []): string[] {
  for (const entrada of fs.readdirSync(pasta, { withFileTypes: true })) {
    const completo = path.join(pasta, entrada.name);
    if (entrada.isDirectory()) arquivosDoApp(sufixo, completo, achados);
    else if (entrada.name === sufixo) achados.push(completo);
  }
  return achados;
}

function arquivosFonte(pasta: string, achados: string[] = []): string[] {
  for (const entrada of fs.readdirSync(pasta, { withFileTypes: true })) {
    const completo = path.join(pasta, entrada.name);
    if (entrada.isDirectory()) arquivosFonte(completo, achados);
    else if (/\.tsx?$/.test(entrada.name) && !entrada.name.endsWith(".test.ts")) achados.push(completo);
  }
  return achados;
}

describe("RootLayout: o que a faixa mostra em cada ambiente", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("avisa que é Sandbox, e diz o que isso significa na prática", async () => {
    vi.stubEnv("APP_ENV", "sandbox");
    const { default: RootLayout } = await carregarLayout();

    const arvore = RootLayout({ children: "conteúdo da tela" });
    const texto = textoDaArvore(arvore);

    expect(texto).toContain("SANDBOX");
    expect(texto).toContain("não é produção");
    // O motivo pelo qual a faixa existe: é aqui que o e-mail some.
    expect(texto).toContain("Nada aqui gera e-mail");
    // A classe do <body> é o que devolve o espaço da faixa (que é fixed) e o
    // que desce as duas barras grudentas. Sem ela a faixa cobre o topo de
    // todas as telas, ver globals.css.
    expect(corpo(arvore).props.className).toBe("com-faixa-de-ambiente");
    // E a tela continua aparecendo por baixo do aviso.
    expect(texto).toContain("conteúdo da tela");
  });

  it("avisa também quando APP_ENV não foi declarada, que é o padrão seguro", async () => {
    vi.stubEnv("APP_ENV", "");
    const { default: RootLayout } = await carregarLayout();

    expect(textoDaArvore(RootLayout({ children: null }))).toContain("SANDBOX");
  });

  it("em produção não sobra vestígio: nem faixa, nem classe no <body>", async () => {
    vi.stubEnv("APP_ENV", "producao");
    const { default: RootLayout } = await carregarLayout();

    const arvore = RootLayout({ children: "conteúdo da tela" });
    const texto = textoDaArvore(arvore);

    expect(texto).not.toContain("SANDBOX");
    expect(texto).not.toContain("não é produção");
    // undefined, e não string vazia: o <body> tem que sair sem atributo de
    // classe, exatamente como era antes desta mudança.
    expect(corpo(arvore).props.className).toBeUndefined();
    expect(elementosDaArvore(arvore).some((e) => e.props.className === "faixa-ambiente")).toBe(false);
    expect(texto).toContain("conteúdo da tela");
  });

  it("o ambiente vai no título da aba, que é o que se vê com a aba em segundo plano", async () => {
    // Com Produção e Sandbox abertos lado a lado, as duas abas se chamavam
    // "Acerto Compras". A faixa só resolve depois de escolher a aba errada.
    vi.stubEnv("APP_ENV", "sandbox");
    expect((await carregarLayout()).metadata.title).toBe("[SANDBOX] Acerto Compras");

    vi.stubEnv("APP_ENV", "producao");
    expect((await carregarLayout()).metadata.title).toBe("Acerto Compras");
  });

  it("o rótulo vem na frente do título, porque é o fim que a aba corta", async () => {
    vi.stubEnv("APP_ENV", "sandbox");
    const titulo = (await carregarLayout()).metadata.title as string;

    expect(titulo.startsWith("[SANDBOX]")).toBe(true);
  });
});

describe("Ligação: a faixa alcança todas as telas, e só uma vez", () => {
  it("as seis telas que ficavam de fora continuam no lugar que o RootLayout embrulha", () => {
    // Se alguma delas sumir ou mudar de lugar, o teste cai e alguém reconfere a
    // lista, em vez de a tela nova nascer sem aviso.
    const DESCOBERTAS = [
      "page.tsx",
      "login/page.tsx",
      "sem-acesso/page.tsx",
      "chamados/[category]/page.tsx",
      "chamados/[category]/novo/page.tsx",
      "chamados/[category]/[id]/page.tsx",
    ];

    for (const relativo of DESCOBERTAS) {
      expect(fs.existsSync(path.resolve(PASTA_APP, relativo)), `tela sumiu: ${relativo}`).toBe(true);
    }
  });

  it("nenhum layout aninhado substitui o RootLayout, que é o único jeito de escapar dele", () => {
    // No App Router um layout aninhado embrulha o raiz, não o substitui: a
    // faixa continua valendo. A exceção é um segundo layout que declare o seu
    // próprio <html> (o caso dos route groups), e é só esse que precisa ser
    // barrado aqui.
    const raizDoLayout = path.resolve(PASTA_APP, "layout.tsx");
    const layouts = arquivosDoApp("layout.tsx");

    expect(layouts).toContain(raizDoLayout);
    for (const layout of layouts.filter((l) => l !== raizDoLayout)) {
      const relativo = path.relative(RAIZ, layout);
      expect(fs.readFileSync(layout, "utf-8"), `${relativo} declara <html> próprio e escapa da faixa`).not.toContain("<html");
    }
  });

  it("todas as telas passam pelo RootLayout, e são mais do que as que o AppShell cobria", () => {
    const telas = arquivosDoApp("page.tsx");
    const pelaCasca = telas.filter((t) => fs.readFileSync(t, "utf-8").includes("AppShell"));

    expect(telas.length).toBeGreaterThanOrEqual(16);
    // O ponto da mudança em um número: a casca de Compras nunca chegou a todas.
    expect(pelaCasca.length).toBeLessThan(telas.length);
  });

  it("só o RootLayout desenha a faixa: nas telas de Compras ela apareceria duas vezes", () => {
    const desenham = arquivosFonte(path.resolve(RAIZ, "src"))
      .filter((arquivo) => fs.readFileSync(arquivo, "utf-8").includes('className="faixa-ambiente"'))
      .map((arquivo) => path.relative(RAIZ, arquivo).split(path.sep).join("/"));

    expect(desenham).toEqual(["src/app/layout.tsx"]);
  });
});

describe("Ligação: o espaço da faixa é devolvido em todas as telas", () => {
  const CSS = fs.readFileSync(path.resolve(PASTA_APP, "globals.css"), "utf-8");

  it("a compensação está ancorada no <body>, e não mais na casca de Compras", () => {
    expect(CSS).toContain("body.com-faixa-de-ambiente {");
    // Ancorada no .app-shell, ela valia só para as telas de Compras: nas
    // outras seis a faixa cobriria o topo do conteúdo.
    expect(CSS, "a compensação voltou a depender do AppShell").not.toContain(".app-shell.com-faixa-de-ambiente");
  });

  it("as duas barras que grudam no alto da janela descem junto", () => {
    // A lateral de Compras e a de topo de Chamados são position: sticky com
    // top: 0. Sem descer o ponto de parada elas começam certas e ficam meio
    // escondidas atrás da faixa no primeiro scroll.
    expect(CSS).toMatch(/body\.com-faixa-de-ambiente \.sidebar \{\s*top: var\(--faixa-ambiente-h\)/);
    expect(CSS).toMatch(/body\.com-faixa-de-ambiente \.topbar \{\s*top: var\(--faixa-ambiente-h\)/);
  });

  it("as telas de janela cheia descontam a faixa da altura, senão nasce rolagem vazia", () => {
    // .app-shell e .login-page são min-height: 100vh. Com o padding do <body>
    // por cima e sem desconto, toda tela ganha 30px de rolagem sem conteúdo.
    const bloco = CSS.slice(CSS.indexOf("body.com-faixa-de-ambiente {"));

    expect(bloco).toMatch(/body\.com-faixa-de-ambiente \.app-shell,\s*\n\s*body\.com-faixa-de-ambiente \.login-page \{\s*\n\s*min-height: calc\(100vh - var\(--faixa-ambiente-h\)\)/);
  });

  it("a altura sai de uma variável só, para as quatro compensações não divergirem", () => {
    const definicoes = CSS.match(/--faixa-ambiente-h:/g) ?? [];

    expect(definicoes.length).toBe(1);
  });
});

/**
 * A exceção conhecida, registrada como teste para não virar surpresa.
 *
 * global-error.tsx renderiza o próprio html e body porque substitui o layout
 * raiz quando ELE quebra, e é Client Component, onde process.env.APP_ENV não
 * existe. É a única tela sem faixa, e por limitação real, não por esquecimento.
 * O teste existe para que quem contar as telas cobertas encontre a exceção
 * escrita, em vez de concluir que a cobertura é total.
 */
describe("a exceção: global-error não tem faixa, e isso é sabido", () => {
  it("não desenha a faixa, e o arquivo diz por quê", () => {
    const fonte = fs.readFileSync(path.join(process.cwd(), "src/app/global-error.tsx"), "utf8");

    expect(fonte).not.toContain("faixa-ambiente");
    expect(fonte).toContain("ÚNICA TELA SEM A FAIXA DE AMBIENTE");
  });

  it("continua sendo Client Component, que é a causa da limitação", () => {
    const fonte = fs.readFileSync(path.join(process.cwd(), "src/app/global-error.tsx"), "utf8");

    // Se algum dia deixar de ser, a limitação some e a faixa passa a caber.
    expect(fonte.startsWith('"use client"')).toBe(true);
  });

  it("o projeto segue sem nenhuma variável NEXT_PUBLIC_, que é o que a exceção protege", () => {
    // A faixa em global-error exigiria expor o ambiente ao navegador, e isso
    // assaria o ambiente no build: o mesmo artefato deixaria de servir os dois.
    const src = path.join(process.cwd(), "src");
    const encontrados: string[] = [];
    const varrer = (dir: string) => {
      for (const nome of fs.readdirSync(dir)) {
        const caminho = path.join(dir, nome);
        if (fs.statSync(caminho).isDirectory()) { varrer(caminho); continue; }
        if (!/\.(ts|tsx)$/.test(nome)) continue;
        // Arquivo de teste fora, e procura o USO e não a palavra: este próprio
        // teste e o comentário de global-error.tsx citam NEXT_PUBLIC_ para
        // explicar por que ela não existe, e um teste que se acusa sozinho
        // ensina a ignorá-lo.
        if (/\.test\.tsx?$/.test(nome)) continue;
        if (fs.readFileSync(caminho, "utf8").includes("process.env.NEXT_PUBLIC_")) {
          encontrados.push(path.relative(process.cwd(), caminho).split(path.sep).join("/"));
        }
      }
    };
    varrer(src);

    expect(encontrados).toEqual([]);
  });
});
