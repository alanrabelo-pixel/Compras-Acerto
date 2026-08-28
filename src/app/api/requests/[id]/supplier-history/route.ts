import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exigirLeituraDeSolicitacao } from "@/lib/acesso";
import { getSupplierHistory } from "@/lib/supplier-history";

/**
 * GET /api/requests/[id]/supplier-history
 *
 * Antes, "soma de compras deste fornecedor nos últimos 12 meses" (usada pelo
 * detector de fracionamento em checkFragmentationRisk) era digitada de
 * memória pelo comprador na Triagem. Não é uma tarefa de IA, é uma consulta
 * factual que o próprio sistema já pode responder. Como a solicitação ainda
 * não tem um Supplier vinculado nesta etapa (só o texto livre
 * indicatedSupplierName, preenchido na abertura), a busca funciona em duas
 * camadas: primeiro tenta casar com um fornecedor já cadastrado (mais
 * confiável, porque aí soma pelo CNPJ real via Pedido de Compra); se não
 * achar, cai para uma correspondência aproximada pelo nome digitado em
 * Pedidos de Compra anteriores. O valor retornado é sempre um PONTO DE
 * PARTIDA editável no formulário, nunca a fonte de verdade definitiva,
 * porque nomes de fornecedor têm variação (razão social x nome fantasia,
 * digitação diferente) que uma correspondência automática pode não cobrir.
 *
 * A resposta é quanto a Acerto já comprou daquele fornecedor em 12 meses, com o
 * nome dele junto: dado de negociação, e não algo que qualquer conta da empresa
 * deva conseguir consultar só por ter o id da solicitação na mão. Mesmo recorte
 * das demais leituras da solicitação.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const barrado = await exigirLeituraDeSolicitacao(params.id);
  if (barrado) return barrado;

  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    select: { indicatedSupplierName: true },
  });
  if (!request) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });

  return NextResponse.json(await getSupplierHistory(request.indicatedSupplierName));
}
