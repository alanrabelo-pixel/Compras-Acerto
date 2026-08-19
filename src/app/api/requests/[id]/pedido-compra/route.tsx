import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { sendPurchaseEmail, templates } from "@/lib/integrations/gmail";
import { avancarEtapa } from "@/lib/etapa";
import { type PedidoCompraItem } from "@/lib/pdf/pedidoCompra";

/**
 * POST /api/requests/[id]/pedido-compra
 *
 * Gera o Pedido de Compra (dados do fornecedor, itens, condições comerciais)
 * e o PDF correspondente. Layout portado do gerador Python/ReportLab já
 * validado pela Acerto (ver src/lib/pdf/pedidoCompra.tsx). Avança para
 * Aguardando Entrega/Conclusão.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: { requester: true },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (request.currentStage !== "PEDIDO_COMPRA") {
    return NextResponse.json({ error: "Solicitação não está na etapa de Pedido de Compra" }, { status: 409 });
  }

  const body = await req.json();
  const {
    actorId, supplierId, supplierLegalName, supplierCnpj, contactName, contactPhone, contactEmail,
    initialValue, negotiatedValue, paymentCondition, installments, currency, needsMeasurement,
    prazoEntrega, localEntrega, frete, items,
  } = body;

  // Valor da parcela: usa o que veio do formulário (pode ter sido ajustado
  // manualmente por arredondamento); se ausente/inválido, calcula a partir
  // de negotiatedValue / installments.
  const installmentValue =
    typeof body.installmentValue === "number" && body.installmentValue > 0
      ? Math.round(body.installmentValue * 100) / 100
      : installments > 0
      ? Math.round((Number(negotiatedValue) / installments) * 100) / 100
      : null;

  const roleError = await requireRole(actorId, ["COMPRADOR"]);
  if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });

  const required = {
    supplierLegalName, supplierCnpj, contactName, contactPhone, contactEmail,
    initialValue, negotiatedValue, paymentCondition, installments, prazoEntrega, localEntrega,
  };
  for (const [key, value] of Object.entries(required)) {
    if (value === undefined || value === null || value === "") {
      return NextResponse.json({ error: `Campo obrigatório ausente: ${key}` }, { status: 400 });
    }
  }

  // Sem limite de itens: o PDF (ver src/lib/pdf/pedidoCompra.tsx) pagina
  // automaticamente quando ultrapassa a primeira página.
  const itemList: PedidoCompraItem[] = Array.isArray(items) ? items : [];
  if (itemList.length === 0) {
    return NextResponse.json({ error: "Informe ao menos 1 item." }, { status: 400 });
  }
  for (const it of itemList) {
    if (!it.descricao || !it.quantidade || it.valorUnitario === undefined) {
      return NextResponse.json({ error: "Cada item precisa de descrição, quantidade e valor unitário." }, { status: 400 });
    }
  }

  const purchaseOrder = await prisma.purchaseOrder.upsert({
    where: { requestId: request.id },
    update: {
      supplierId: supplierId || undefined, supplierLegalName, supplierCnpj, contactName, contactPhone, contactEmail,
      initialValue, negotiatedValue, paymentCondition, installments, installmentValue, currency: currency ?? "BRL",
      needsMeasurement: Boolean(needsMeasurement), prazoEntrega, localEntrega, frete: frete ?? "CIF",
    },
    create: {
      requestId: request.id, supplierId: supplierId || undefined, supplierLegalName, supplierCnpj,
      contactName, contactPhone, contactEmail, initialValue, negotiatedValue, paymentCondition,
      installments, installmentValue, currency: currency ?? "BRL", needsMeasurement: Boolean(needsMeasurement),
      prazoEntrega, localEntrega, frete: frete ?? "CIF",
    },
  });

  // Substitui os itens a cada geração (o formulário sempre envia a lista completa atual).
  await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: purchaseOrder.id } });
  await prisma.purchaseOrderItem.createMany({
    data: itemList.map((it, index) => ({
      purchaseOrderId: purchaseOrder.id,
      descricao: it.descricao,
      quantidade: it.quantidade,
      valorUnitario: it.valorUnitario,
      impostosPercent: it.impostosPercent ?? 0,
      valorTotal: it.valorTotal ?? it.quantidade * it.valorUnitario * (1 + (it.impostosPercent ?? 0) / 100),
      order: index,
    })),
  });

  // O PDF era renderizado aqui e gravado em public/pedidos-compra/{código}.pdf,
  // servido como arquivo estático. Dois problemas nisso:
  //
  // 1. O nome é previsível (PC-2026-0001, 0002, ...) e arquivo em public/ é
  //    servido pelo Next sem passar por rota nenhuma, então dava para enumerar
  //    todos os pedidos de compra da empresa: fornecedor, CNPJ, valor
  //    negociado, condição de pagamento.
  // 2. A pasta está no .gitignore e o disco é efêmero na Vercel, então os
  //    arquivos sumiam no deploy seguinte e o link gravado no banco quebrava.
  //
  // A rota GET .../pedido-compra/pdf já regenera o documento a partir dos mesmos
  // dados a cada chamada, então renderizar aqui era trabalho jogado fora. Isso
  // também tira a geração de PDF (segundos, três fontes TTF) do caminho de quem
  // está esperando a resposta.
  //
  // Contrapartida assumida: antes, um erro de geração derrubaria este POST e a
  // etapa não avançaria. Agora ele só apareceria no download. O risco é baixo
  // porque os dados são os mesmos que acabaram de ser validados e gravados.
  const pdfUrl = `/api/requests/${request.id}/pedido-compra/pdf`;

  await prisma.purchaseOrder.update({ where: { id: purchaseOrder.id }, data: { pdfUrl } });

  const avanco = await avancarEtapa({
    requestId: request.id,
    de: "PEDIDO_COMPRA",
    para: "AGUARDANDO_ENTREGA",
    actorId,
    comentario: `Pedido de Compra ${request.code} gerado.`,
  });
  if (!avanco.ok) {
    return NextResponse.json({ error: avanco.erro }, { status: avanco.status });
  }

  // Template próprio, com o link do PDF: não é o aviso genérico de avanço.
  const { subject, html } = templates.pedidoCompraGerado(request.requester.name, request.shortDescription, request.code, `${process.env.APP_URL}${pdfUrl}`);
  await sendPurchaseEmail({ to: request.requester.email, subject, html, requestId: request.id });

  return NextResponse.json({ purchaseOrder: { ...purchaseOrder, pdfUrl }, request: avanco.solicitacao }, { status: 201 });
}
