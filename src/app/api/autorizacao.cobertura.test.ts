import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Nenhuma rota de API sobe sem autorização.
 *
 * Este teste existe por causa de um padrão, não de um bug. Em 20/08/2026, um
 * agente adversarial atacou as 16 rotas de leitura recém-protegidas e achou 12
 * furos. Nenhum estava nas guardas: todos eram ROTA IRMÃ ESQUECIDA, aberta,
 * entregando o mesmo dado. A guarda em /api/search não valia nada enquanto
 * /api/contracts/search devolvia mais coisa sem pedir licença.
 *
 * Diligência não resolve isso, porque o esquecimento é o modo de falha. O que
 * resolve é a rota nova nascer reprovada até alguém decidir quem pode chamá-la.
 *
 * O middleware (src/middleware.ts) exige SESSÃO em /api/*, e isso não conta
 * como autorização aqui: qualquer conta @acerto.com.br passa por ele. O que
 * conta é o handler decidir QUEM pode.
 */

const GUARDAS = [
  // src/lib/acesso.ts
  "exigirLeituraDeSolicitacao",
  "exigirLeituraDeChamado",
  "exigirLeituraDeContrato",
  "exigirQuadro",
  "exigirPapel",
  "atorDaSessao",
  // src/lib/rbac.ts
  "requireRole",
  // autenticação de máquina
  "requireErpAuth",
  "verificarTokenDeMaquina",
  "verifySignature",
  // recorte por identidade, equivalente a guarda (a consulta já filtra por quem é)
  "resolveChamadoViewer",
  // Checagem inline, anterior às primitivas: o handler lê a sessão e decide na
  // mão. Vale como decisão de autorização, mas é reconhecidamente frouxo como
  // sinal: este teste não distingue uma checagem de verdade de uma chamada
  // decorativa. Ele responde "o handler pensou em quem pode chamar", não "a
  // regra está certa". Quem consolidar essas rotas nas primitivas de
  // @/lib/acesso.ts pode remover as duas entradas abaixo.
  "getServerSession",
  "loadCurrentUser",
];

/**
 * Exceções conscientes. Toda entrada precisa de motivo escrito: a lista existe
 * para a exceção ser revisada por gente, não para calar o teste.
 */
const EXCECOES: { rota: string; metodo: string; motivo: string }[] = [
  {
    rota: "auth/[...nextauth]",
    metodo: "*",
    motivo: "É o próprio NextAuth. Exigir autorização aqui impediria o login.",
  },
  {
    rota: "manual/pdf",
    metodo: "GET",
    motivo:
      "Manual do processo, material de orientação para todo colaborador. Não lê dado de solicitação nenhuma, é conteúdo estático montado em código.",
  },
  {
    rota: "contratos/import",
    metodo: "GET",
    motivo:
      "Devolve a planilha MODELO, montada a partir de constantes do próprio arquivo (TEMPLATE_COLUMNS/TEMPLATE_EXAMPLE). Não consulta o banco. O POST irmão, que importa de verdade, exige ADMIN.",
  },
  {
    rota: "contracts/search",
    metodo: "GET",
    motivo:
      "Exposição deliberada, com limite. Alimenta o ContractPicker do formulário de dúvida jurídica sobre contrato ativo (NdaRequestForm.tsx), que qualquer colaborador abre: exigir canViewBoard aqui derrubaria o formulário para justamente quem ele atende. O que a limita é a rota só responder a partir de um termo de busca de 3 caracteres (MINIMO_DO_TERMO em route.ts, coberto por contracts/search/busca.exposicao.test.ts); sem termo devolve lista vazia, e não mais os 25 contratos ativos que faziam dela uma listagem da carteira. Ela devolve só id, razão social, nome fantasia e objeto de contratos ATIVOS: nada de valor, prazo, cláusula ou gestor, que ficam no GET /api/contracts/[id], esse sim com exigirLeituraDeContrato.",
  },
  {
    rota: "tickets",
    metodo: "POST",
    motivo:
      "Abertura de chamado de Viagens, Facilities ou NDA: qualquer pessoa da Acerto pode abrir. A identidade de quem abre é que precisa vir da sessão, e isso é regra da rota, não deste teste.",
  },
  {
    rota: "announcements",
    metodo: "GET",
    motivo:
      "Comunicado é para a empresa inteira: é o mural que aparece no AppShell de todas as telas, inclusive as abertas a quem só solicita. Restringir esvaziaria o mural justamente para o público a que ele se dirige. O conteúdo é publicado sabendo que todo colaborador lê, e o POST irmão, que publica, exige ADMIN.",
  },
  {
    rota: "cost-centers",
    metodo: "GET",
    motivo:
      "Alimenta o campo obrigatório Centro de Custo Gerencial do formulário de Nova Solicitação (/solicitacoes/nova), que qualquer colaborador abre; sem esta listagem ninguém consegue abrir uma compra. Devolve id, nome e o nome do(s) gestor(es) aprovador(es), e este último é mostrado de propósito para a pessoa saber quem vai aprovar antes de enviar. A resposta usa select explícito para nenhuma coluna nova de CostCenter passar a vazar sozinha.",
  },
  {
    rota: "budget-lines",
    metodo: "GET",
    motivo:
      "Ficaria aberta por alimentar o campo Linha do Orçamento de Nova Solicitação, aberta a qualquer colaborador. ATENÇÃO, conferido em 20/08/2026 e o motivo não se sustenta: nenhuma tela chama esta rota. O campo Linha do Orçamento é manual (só Orçamento Extra e Outros, ver EXTRA_BUDGET/OTHER_BUDGET em NovaSolicitacaoForm.tsx) e a solicitação grava budgetLineText em texto livre. A rota está sem consumidor nenhum e devolve BudgetLine inteiro, com `available`, o saldo em reais de cada linha por mês. Enquanto seguir sem consumidor, o certo é fechar com exigirQuadro ou remover a rota; esta entrada existe para essa decisão ser tomada por gente e não ficar calada.",
  },
  {
    rota: "requests/suggest",
    metodo: "POST",
    motivo:
      "Assistente de preenchimento da Nova Solicitação, aberta a qualquer colaborador (é a mesma tela do POST /api/requests, exceção 'tickets' acima). Até 27/08/2026 a rota carregava a CHAVE PESSOAL de IA de quem pedia, e por isso decidia identidade a partir da sessão; desde a troca para chave única da empresa (ver src/lib/integrations/ai.ts) não há mais cota nem conta de ninguém em jogo, a rota não lê nem grava nada — é sugestão stateless a partir de um texto livre — e não sobrou nenhuma decisão de acesso além de 'está logado', que o middleware já garante.",
  },
  {
    rota: "users/[id]/avatar",
    metodo: "GET",
    motivo:
      "Serve a foto de perfil, exibida no UserAvatar em toda a interface: cabeçalho, listas de solicitações, comentários. Quem aparece na tela de alguém precisa ter a foto carregável por essa pessoa, e o dado é a imagem que a própria pessoa escolheu publicar internamente. Devolve 404 quando não há foto, sem revelar nada sobre o usuário. O POST irmão, que troca a foto, exige sessão SSO real e só a própria pessoa.",
  },
];

const METODOS = ["GET", "POST", "PATCH", "PUT", "DELETE"];

function arquivosDeRota(dir: string, encontrados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = path.join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      arquivosDeRota(caminho, encontrados);
      continue;
    }
    if (/^route\.tsx?$/.test(nome)) encontrados.push(caminho);
  }
  return encontrados;
}

/**
 * Recorta o corpo de cada handler exportado. Recorte por texto, não por AST:
 * a guarda desta base é sempre uma chamada no começo do handler, então basta
 * saber se o nome aparece dentro do trecho daquele método.
 */
/**
 * Nomes de funções locais do arquivo que por sua vez fazem a checagem. Sem
 * resolver isso, o teste acusa falso positivo justamente nas rotas mais bem
 * escritas, e um teste que mente em uma direção deixa de ser levado a sério
 * na outra.
 */
function guardasLocaisDe(conteudo: string): string[] {
  const nomes: string[] = [];
  const re = /(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(conteudo)) !== null) {
    const nome = m[1];
    if (METODOS.includes(nome)) continue;
    const inicio = m.index;
    const fim = conteudo.indexOf("\nexport ", inicio);
    const corpo = conteudo.slice(inicio, fim === -1 ? conteudo.length : fim);
    if (GUARDAS.some((g) => corpo.includes(g))) nomes.push(nome);
  }
  return nomes;
}

function handlersDe(conteudo: string): { metodo: string; corpo: string }[] {
  const marcas: { metodo: string; inicio: number }[] = [];
  for (const metodo of METODOS) {
    const re = new RegExp(`export\\s+async\\s+function\\s+${metodo}\\b`);
    const m = re.exec(conteudo);
    if (m) marcas.push({ metodo, inicio: m.index });
  }
  marcas.sort((a, b) => a.inicio - b.inicio);

  return marcas.map((marca, i) => ({
    metodo: marca.metodo,
    corpo: conteudo.slice(marca.inicio, marcas[i + 1]?.inicio ?? conteudo.length),
  }));
}

describe("cobertura de autorização das rotas de API", () => {
  it("todo handler decide quem pode chamá-lo", () => {
    const raiz = path.join(process.cwd(), "src", "app", "api");
    const desprotegidos: string[] = [];

    for (const arquivo of arquivosDeRota(raiz)) {
      const rota = path
        .relative(raiz, path.dirname(arquivo))
        .replace(/\\/g, "/");
      const conteudo = readFileSync(arquivo, "utf8");
      const aceitos = [...GUARDAS, ...guardasLocaisDe(conteudo)];

      for (const handler of handlersDe(conteudo)) {
        const dispensado = EXCECOES.some(
          (e) => e.rota === rota && (e.metodo === "*" || e.metodo === handler.metodo)
        );
        if (dispensado) continue;

        const temGuarda = aceitos.some((g) => handler.corpo.includes(g));
        if (!temGuarda) desprotegidos.push(`${handler.metodo} /api/${rota}`);
      }
    }

    expect(
      desprotegidos.sort(),
      `Handler de API sem nenhuma decisão de autorização. Estar atrás do ` +
        `middleware não basta: ele só garante que existe uma sessão, e qualquer ` +
        `conta @acerto.com.br tem uma. Use uma das guardas de @/lib/acesso.ts, ` +
        `ou requireRole de @/lib/rbac.ts, ou registre a exceção com motivo em ` +
        `EXCECOES neste arquivo:\n\n${desprotegidos.sort().join("\n")}\n`
    ).toEqual([]);
  });

  it("toda exceção aponta para uma rota que existe, senão a lista envelhece calada", () => {
    const raiz = path.join(process.cwd(), "src", "app", "api");
    const rotasReais = new Set(
      arquivosDeRota(raiz).map((a) => path.relative(raiz, path.dirname(a)).replace(/\\/g, "/"))
    );
    const orfas = EXCECOES.filter((e) => !rotasReais.has(e.rota)).map((e) => e.rota);
    expect(orfas, `Exceção registrada para rota que não existe mais: ${orfas.join(", ")}`).toEqual([]);
  });
});
