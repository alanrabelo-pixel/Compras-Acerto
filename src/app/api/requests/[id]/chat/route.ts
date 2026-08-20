import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { atorDaSessao, exigirLeituraDeSolicitacao, type Ator } from "@/lib/acesso";
import { createAppChatMessage, type ChatRole } from "@/lib/requestChat";

// GET /api/requests/[id]/chat: histórico do widget de chat comprador ↔ solicitante.
// A conversa é sobre a solicitação e cita valor, fornecedor e motivo de recusa,
// então quem não pode ler a solicitação não pode ler o que foi conversado nela.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const barrado = await exigirLeituraDeSolicitacao(params.id);
  if (barrado) return barrado;

  const messages = await prisma.requestChatMessage.findMany({
    where: { requestId: params.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ messages });
}

// POST /api/requests/[id]/chat: mensagem enviada pelo widget, espelhada via Slack DM quando possível.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const barrado = await exigirLeituraDeSolicitacao(params.id);
  if (barrado) return barrado;

  const body = await req.json();
  const { authorRole, authorName, body: text } = body as { authorRole: ChatRole; authorName: string; body: string };

  const request = await prisma.purchaseRequest.findUnique({ where: { id: params.id } });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });

  // Quem assina a mensagem. authorRole e authorName vinham inteiros do corpo, e
  // o widget deixa a própria pessoa escolher "Você é: Solicitante / Comprador",
  // então qualquer um que abrisse a solicitação escrevia como COMPRADOR com o
  // nome que quisesse, e isso ainda era espelhado em DM no Slack para a outra
  // parte, com aparência de mensagem oficial do time de Compras.
  //
  // Havendo sessão, ela manda e o corpo é ignorado. Sem sessão (só acontece em
  // desenvolvimento com LOCAL_BYPASS_AUTH, que faz a guarda acima liberar
  // tudo), cai no corpo, senão o formulário local para de funcionar.
  const ator = await atorDaSessao();
  const usuario = ator ? await prisma.user.findUnique({ where: { id: ator.id }, select: { name: true } }) : null;
  const papel = ator ? papelNaConversa(ator, request) : authorRole;
  const nome = ator ? usuario?.name?.trim() || ator.email : authorName?.trim();

  if (!papel || !["COMPRADOR", "SOLICITANTE"].includes(papel)) {
    return NextResponse.json({ error: "Não foi possível identificar se quem escreve é o comprador ou o solicitante." }, { status: 400 });
  }
  if (!nome?.trim() || !text?.trim()) {
    return NextResponse.json({ error: "Nome e mensagem são obrigatórios." }, { status: 400 });
  }

  const message = await createAppChatMessage({
    requestId: params.id,
    authorRole: papel,
    authorName: nome.trim(),
    body: text.trim(),
  });

  return NextResponse.json({ message }, { status: 201 });
}

/**
 * De que lado da conversa está quem enviou, pela solicitação e não pelo que o
 * cliente disse. Quem não é parte mas chegou até aqui (a guarda deixa passar
 * quem vê o quadro) entra pelo papel: o time de Compras escreve como COMPRADOR,
 * o resto como SOLICITANTE. O papel decide também para quem vai a DM no Slack
 * (ver createAppChatMessage), então tem que sair de um fato do registro.
 */
function papelNaConversa(ator: Ator, request: { requesterId: string; buyerId: string | null }): ChatRole {
  if (ator.id === request.buyerId) return "COMPRADOR";
  if (ator.id === request.requesterId) return "SOLICITANTE";
  return ator.papeis.includes("COMPRADOR") ? "COMPRADOR" : "SOLICITANTE";
}
