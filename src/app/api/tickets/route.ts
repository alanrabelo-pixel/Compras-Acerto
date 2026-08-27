import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { TICKET_CATEGORIES, isTicketCategorySlug } from "@/lib/tickets";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";
import { avisar } from "@/lib/avisar";
import { proximoCodigo } from "@/lib/codigo";
import { resolveChamadoViewer } from "@/lib/chamados-viewer";
import { naoAutenticado } from "@/lib/acesso";
import { validarCorpo, comExcecaoControlada } from "@/lib/validacao-api";

/**
 * Achado do DAST de 25/08/2026: um caractere de aspas em qualquer um destes
 * campos derrubava a rota com 500 sem detalhe nenhum, e o scanner leu isso
 * como indício de SQL injection. Não é — todo acesso a banco aqui passa pelo
 * Prisma, que parametriza por construção. O que faltava era isto: nada
 * validava o formato do corpo antes de tentar usá-lo, então qualquer exceção
 * (nem sempre a mesma) virava 500 cru. Limite de tamanho aqui também cobre o
 * achado de "estouro de buffer" do mesmo relatório, mesma causa.
 */
const corpoDoChamado = z.object({
  category: z.string(),
  requesterName: z.string().trim().min(1, "informe seu nome").max(200),
  requesterEmail: z.string().trim().email("e-mail inválido").max(200),
  description: z.string().trim().min(1, "descreva o que você precisa").max(5000),
  requestKind: z.string().max(50).optional(),
  supplierName: z.string().max(200).optional(),
  supplierContactName: z.string().max(200).optional(),
  supplierContactRole: z.string().max(200).optional(),
  supplierContactEmail: z.string().email().max(200).optional().or(z.literal("")),
  supplierContactPhone: z.string().max(50).optional(),
  contractId: z.string().max(200).optional(),
  contractSupplierName: z.string().max(200).optional(),
  contractObject: z.string().max(2000).optional(),
});

// GET /api/tickets?category=viagens|facilities: lista chamados de uma categoria.
//
// Recorte igual ao da tela (src/app/chamados/[category]/page.tsx): quem tem
// canViewBoard vê a categoria inteira, quem não tem vê só os próprios, por
// requesterEmail (SimpleTicket não tem FK pra User, ver chamados-viewer.ts).
// Não é exigirQuadro seco de propósito: isso tiraria do solicitante o
// acompanhamento do que ele mesmo abriu, que a tela permite. Sem a guarda,
// qualquer conta autenticada lia os chamados de todo mundo, inclusive os de
// NDA com dados de fornecedor.
export async function GET(req: NextRequest) {
  const viewer = await resolveChamadoViewer(req.nextUrl.searchParams.get("userId") ?? undefined);
  // Sem quadro e sem e-mail resolvido significa requisição sem sessão. Vale um
  // 401 explícito em vez de uma lista vazia, que esconderia o motivo. Em
  // LOCAL_BYPASS_AUTH o viewer já volta showFullBoard, então esta linha não é
  // alcançada lá (o bypass é tratado dentro de resolveChamadoViewer).
  if (!viewer.showFullBoard && !viewer.email) return naoAutenticado();

  const categorySlug = req.nextUrl.searchParams.get("category") ?? "";
  if (!isTicketCategorySlug(categorySlug)) {
    return NextResponse.json({ error: "Categoria inválida." }, { status: 400 });
  }

  const tickets = await prisma.simpleTicket.findMany({
    where: {
      category: TICKET_CATEGORIES[categorySlug].enumValue,
      ...(viewer.showFullBoard ? {} : { requesterEmail: viewer.email }),
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(tickets);
}

// POST /api/tickets: cria um novo chamado (nome, e-mail, descrição livre).
// supplierName/supplierContact* e requestKind/contract* são exclusivos do
// fluxo de Jurídico (ver NdaRequestForm.tsx) e opcionais, ficam undefined
// para Viagens/Facilities. requestKind distingue "NDA" de "CONTRATO" dentro
// dessa mesma categoria.
export async function POST(req: NextRequest) {
  return comExcecaoControlada("POST /api/tickets", async () => {
    const corpoBruto = await req.json();
    const validacao = validarCorpo(corpoDoChamado, corpoBruto);
    if (!validacao.ok) return validacao.resposta;

    const {
      category: categorySlug, requesterName, requesterEmail, description, requestKind,
      supplierName, supplierContactName, supplierContactRole, supplierContactEmail, supplierContactPhone,
      contractId, contractSupplierName, contractObject,
    } = validacao.dados;

    if (!isTicketCategorySlug(categorySlug)) {
      return NextResponse.json({ error: "Categoria inválida." }, { status: 400 });
    }

    const config = TICKET_CATEGORIES[categorySlug];
    const code = await proximoCodigo(config.prefix);

    const ticket = await prisma.simpleTicket.create({
      data: {
        code, category: config.enumValue, requesterName, requesterEmail, description,
        requestKind: requestKind || undefined,
        supplierName: supplierName || undefined,
        supplierContactName: supplierContactName || undefined,
        supplierContactRole: supplierContactRole || undefined,
        supplierContactEmail: supplierContactEmail || undefined,
        supplierContactPhone: supplierContactPhone || undefined,
        contractId: contractId || undefined,
        contractSupplierName: contractSupplierName || undefined,
        contractObject: contractObject || undefined,
      },
    });

    const link = `${process.env.APP_URL}/chamados/${categorySlug}/${ticket.id}`;
    const { subject, html } = templates.chamadoAberto(requesterName, config.label, code, link);
    await avisar({
      para: requesterEmail,
      assunto: subject,
      html,
      slack:
        `*Chamado  recebido*

` +
        `Acompanhe as respostas por aqui: <|abrir o chamado>`,
      origem: "chamado aberto",
    });

    return NextResponse.json(ticket, { status: 201 });
  });
}
