import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { RoleName, Stage } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canViewBoard } from "@/lib/roles";
import { bypassAuthAtivo } from "@/lib/bypass";

/**
 * Quem pode LER o quê.
 *
 * O middleware coloca /api/* atrás de sessão, mas só isso: qualquer conta
 * @acerto.com.br passa. Um inventário das 74 rotas em 20/08/2026 encontrou 37
 * sem nenhuma autorização além disso, e 16 delas de risco alto, entre elas o
 * download de qualquer anexo, a carteira inteira de contratos e a exportação
 * completa da base em Excel. A causa é sempre a mesma: a auditoria anterior
 * fechou os caminhos de ESCRITA e não olhou os de leitura.
 *
 * A regra aqui não é nova, é a que as telas já aplicam. O middleware libera
 * /solicitacoes, /contratos e /dashboards para quem tem `canViewBoard`
 * (ADMIN, COMPRADOR, APROVADOR, CONTROLADORIA, ver src/lib/roles.ts), e a
 * tela de chamados mostra só os próprios para quem não tem. O que faltava era
 * a API exigir o mesmo que a tela, já que a rota é chamável direto.
 *
 * Por que retornar NextResponse em vez de lançar: é o padrão que as rotas
 * desta base já usam com requireRole, e mantém a mensagem de erro em
 * português no mesmo formato do resto.
 */

/**
 * Quem atua em cada etapa. Não é lista nova: foi extraída do `requireRole` que
 * cada rota de etapa já exige para ESCREVER, então ler e escrever passam a
 * usar o mesmo conjunto, em vez de duas regras que envelhecem separadas.
 *
 * Se uma rota de etapa mudar o papel que exige, esta tabela precisa mudar
 * junto. Etapa fora da lista (Solicitação, Aguardando Entrega no que depende
 * do fornecedor, Concluído, Cancelado) cai no recorte por parte e por quadro.
 */
const PAPEIS_QUE_ATUAM_NA_ETAPA: Partial<Record<Stage, RoleName[]>> = {
  APROVACAO_GESTOR: ["APROVADOR"],
  TRIAGEM: ["COMPRADOR"],
  VALIDACAO_ORCAMENTARIA: ["COMPRADOR"],
  DUE_DILIGENCE: ["PRIVACIDADE"],
  COTACAO: ["COMPRADOR"],
  MAPA_COTACAO: ["COMPRADOR"],
  APROVACAO: ["APROVADOR"],
  JURIDICO: ["JURIDICO"],
  PEDIDO_COMPRA: ["COMPRADOR"],
  AGUARDANDO_ENTREGA: ["COMPRADOR"],
  MEDICAO: ["COMPRADOR"],
  FISCAL: ["FISCAL"],
  TESOURARIA: ["TESOURARIA"],
  MAPEAMENTO_CONTRATO: ["COMPRADOR"],
};

export type Ator = {
  id: string;
  email: string;
  papeis: RoleName[];
  veQuadro: boolean;
};

/**
 * Quem está chamando, resolvido a partir da SESSÃO. Nunca do corpo da
 * requisição: metade das rotas de escrita desta base aceita `actorId` ou
 * `uploadedBy` vindo do cliente, e é exatamente assim que alguém age em nome
 * de outra pessoa.
 */
export async function atorDaSessao(): Promise<Ator | null> {
  // Com o bypass ligado não existe sessão para buscar, e insistir em buscar
  // quebra: getServerSession lê os headers da requisição e estoura com
  // "headers was called outside a request scope" fora de um contexto de
  // requisição de verdade. Devolver null aqui é o que faz o padrão
  // `ator?.id ?? valorDoCorpo` cair no corpo em desenvolvimento, que é
  // exatamente o comportamento desejado.
  if (bypassAuthAtivo()) return null;

  const session = await getServerSession(authOptions);
  const user = session?.user as
    | { id?: string; email?: string | null; roles?: string[]; canViewBoard?: boolean }
    | undefined;

  // Sem id significa sem sessão válida OU usuário desativado: o callback
  // session() de src/lib/auth.ts zera o id quando a pessoa perde o acesso, e é
  // isso que faz a revogação valer na hora para as rotas de API. Não vale
  // consultar o banco aqui para "resolver" o id: seria justamente desfazer a
  // revogação.
  if (!user?.id) return null;

  // veQuadro aceita a COLUNA User.canViewBoard ou a derivação a partir dos
  // papéis, e não só a coluna. Motivo, medido no banco em 20/08/2026: a coluna
  // é recalculada a partir dos papéis toda vez que alguém é salvo em
  // /admin/acessos (ver src/app/api/users/[id]/route.ts, BOARD_ROLES), mas 13
  // dos 22 usuários ativos estavam divergentes, porque vieram do seed sem
  // passar por esse caminho. Onze deles têm papel de quadro com a coluna em
  // false, incluindo a Controladoria. Confiar só na coluna barraria essas
  // pessoas de tudo, por causa de dado velho e não de decisão de acesso.
  //
  // O efeito colateral é a API ficar um pouco mais permissiva que o
  // middleware, que só olha a coluna. É o lado certo para errar: essas pessoas
  // deveriam ter acesso pela regra do próprio produto. O conserto de verdade é
  // reconciliar a coluna, e isso é ação no /admin/acessos, não no código.
  const papeis = (user.roles ?? []) as RoleName[];
  return {
    id: user.id,
    email: user.email ?? "",
    papeis,
    veQuadro: Boolean(user.canViewBoard) || canViewBoard(papeis),
  };
}

export function naoAutenticado(): NextResponse {
  return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
}

export function semAcesso(mensagem: string): NextResponse {
  return NextResponse.json({ error: mensagem }, { status: 403 });
}

/**
 * Em desenvolvimento com LOCAL_BYPASS_AUTH não existe sessão, então toda
 * checagem passa, igual ao que requireRole já faz. Em produção a flag é
 * sempre falsa (ver src/lib/bypass.ts).
 */
function liberadoPeloBypass(): boolean {
  return bypassAuthAtivo();
}

/**
 * Leitura de uma Solicitação de Compra.
 *
 * Pode ler quem tem acesso ao quadro (é o mesmo conjunto que já enxerga a
 * tela) e quem é parte naquela solicitação específica: quem pediu, o
 * comprador responsável, o gestor aprovador e qualquer aprovador de alçada
 * designado. Parte na solicitação lê a própria mesmo sem acesso ao quadro,
 * senão o solicitante perderia a própria compra de vista.
 */
export async function exigirLeituraDeSolicitacao(requestId: string): Promise<NextResponse | null> {
  if (liberadoPeloBypass()) return null;

  const ator = await atorDaSessao();
  if (!ator) return naoAutenticado();
  if (ator.veQuadro) return null;

  const solicitacao = await prisma.purchaseRequest.findUnique({
    where: { id: requestId },
    select: {
      currentStage: true,
      requesterId: true,
      buyerId: true,
      approverManagerId: true,
      approvals: { select: { approverId: true } },
    },
  });
  // Solicitação inexistente devolve 403 em vez de 404 de propósito: responder
  // "não encontrada" para quem não teria acesso de qualquer jeito confirma ou
  // nega a existência de um id para quem estiver varrendo.
  if (!solicitacao) return semAcesso("Você não tem acesso a esta solicitação.");

  const ehParte =
    solicitacao.requesterId === ator.id ||
    solicitacao.buyerId === ator.id ||
    solicitacao.approverManagerId === ator.id ||
    solicitacao.approvals.some((a) => a.approverId === ator.id);
  if (ehParte) return null;

  // Quem trabalha na etapa em que a solicitação está agora também lê, mesmo
  // sem quadro e sem ser parte. Sem isto, Jurídico, Privacidade, Fiscal e
  // Tesouraria levariam 403 justamente na solicitação que estão processando:
  // esses quatro papéis não estão em BOARD_ROLES e não aparecem como parte em
  // campo nenhum da solicitação.
  const donosDaEtapa = PAPEIS_QUE_ATUAM_NA_ETAPA[solicitacao.currentStage] ?? [];
  if (ator.papeis.some((p) => donosDaEtapa.includes(p))) return null;

  return semAcesso("Você não tem acesso a esta solicitação.");
}

/**
 * Leitura de um Chamado (Viagens, Facilities, NDA).
 *
 * SimpleTicket não tem FK para User, guarda requesterEmail em texto livre, e
 * por isso o recorte "meu" é por e-mail, igual ao que a tela faz em
 * src/lib/chamados-viewer.ts.
 *
 * ASSUNÇÃO REGISTRADA: não existe papel de "atendente de chamados" no
 * sistema. Quem atende Viagens e Facilities hoje é coberto por canViewBoard,
 * que é o conjunto do time interno. Se um dia existir um papel próprio para
 * isso, é aqui que ele entra.
 */
export async function exigirLeituraDeChamado(ticketId: string): Promise<NextResponse | null> {
  if (liberadoPeloBypass()) return null;

  const ator = await atorDaSessao();
  if (!ator) return naoAutenticado();
  if (ator.veQuadro) return null;

  const chamado = await prisma.simpleTicket.findUnique({
    where: { id: ticketId },
    select: { requesterEmail: true },
  });
  if (!chamado) return semAcesso("Você não tem acesso a este chamado.");

  if (chamado.requesterEmail.toLowerCase() === ator.email.toLowerCase()) return null;
  return semAcesso("Você não tem acesso a este chamado.");
}

/**
 * Leitura de Contrato. Mesmo conjunto da tela /contratos, mais o gestor
 * daquele contrato, que precisa enxergar o que gerencia mesmo sem quadro.
 */
export async function exigirLeituraDeContrato(contractId: string): Promise<NextResponse | null> {
  if (liberadoPeloBypass()) return null;

  const ator = await atorDaSessao();
  if (!ator) return naoAutenticado();
  if (ator.veQuadro) return null;

  const contrato = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { contractManagerId: true },
  });
  if (!contrato) return semAcesso("Você não tem acesso a este contrato.");

  if (contrato.contractManagerId === ator.id) return null;
  return semAcesso("Você não tem acesso a este contrato.");
}

/**
 * Leitura de listagem ampla: quadro de solicitações, carteira de contratos,
 * exportações, busca global. Sem recorte por registro, então exige o mesmo
 * canViewBoard que o middleware exige para a tela equivalente.
 */
export async function exigirQuadro(oQue = "esta informação"): Promise<NextResponse | null> {
  if (liberadoPeloBypass()) return null;

  const ator = await atorDaSessao();
  if (!ator) return naoAutenticado();
  if (ator.veQuadro) return null;

  return semAcesso(
    `Você não tem acesso a ${oQue}. Peça a um administrador para liberar o acesso ao quadro em Administração, Acessos.`
  );
}

/**
 * Leitura restrita a papéis específicos, quando canViewBoard é largo demais.
 * Usado onde o dado é sensível mesmo dentro do time (ex: quem aprova o quê).
 */
export async function exigirPapel(papeis: RoleName[], oQue = "esta informação"): Promise<NextResponse | null> {
  if (liberadoPeloBypass()) return null;

  const ator = await atorDaSessao();
  if (!ator) return naoAutenticado();
  if (ator.papeis.includes("ADMIN")) return null;
  if (ator.papeis.some((p) => papeis.includes(p))) return null;

  return semAcesso(`Você não tem acesso a ${oQue}.`);
}
