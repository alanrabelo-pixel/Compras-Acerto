import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { todasAsFaixas } from "@/lib/alcadas";
import { exigirPapel, exigirQuadro } from "@/lib/acesso";

/**
 * Faixas de alçada da Aprovação final (ApprovalTier).
 *
 * SEPARADA de /api/approval-tiers vs /api/approval-levels de propósito: aqui
 * está a FORMA da escada (faixa, teto, quantas assinaturas), que a tela da
 * solicitação precisa para dizer "esta compra exige 2 aprovadores"; lá está
 * QUEM aprova cada faixa, que é informação de controle interno e continua
 * restrita a ADMIN. Juntar as duas obrigaria a escolher entre vazar os nomes
 * ou deixar o comprador sem saber quantas assinaturas a compra exige.
 */

/** GET: a escada, para quem vê o quadro. Inclui desativadas só para o ADMIN. */
export async function GET(req: NextRequest) {
  const barrado = await exigirQuadro("as faixas de alçada");
  if (barrado) return barrado;

  const faixas = await todasAsFaixas();
  const querTodas = req.nextUrl.searchParams.get("incluirInativas") === "true";
  if (!querTodas) return NextResponse.json(faixas.filter((f) => f.active));

  // A lista com as desativadas é da tela de administração, e só ADMIN a vê:
  // uma faixa desativada conta a história de como a alçada já foi, que não é
  // informação para o quadro inteiro.
  const semPapel = await exigirPapel(["ADMIN"], "as faixas de alçada desativadas");
  if (semPapel) return semPapel;
  return NextResponse.json(faixas);
}

/** POST: inclui uma faixa nova. */
export async function POST(req: NextRequest) {
  const barrado = await exigirPapel(["ADMIN"], "criar faixa de alçada");
  if (barrado) return barrado;

  const body = await req.json();
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const requiredApprovers = Number(body.requiredApprovers);
  const semTeto = body.maxValue === null || body.maxValue === undefined || body.maxValue === "";
  const maxValue = semTeto ? null : Number(body.maxValue);

  if (!label) return NextResponse.json({ error: "Informe o nome da faixa." }, { status: 400 });
  if (!Number.isInteger(requiredApprovers) || requiredApprovers < 1) {
    return NextResponse.json({ error: "O número de assinaturas precisa ser 1 ou mais." }, { status: 400 });
  }
  if (maxValue !== null && (!Number.isFinite(maxValue) || maxValue <= 0)) {
    return NextResponse.json({ error: "O teto da faixa precisa ser um valor maior que zero." }, { status: 400 });
  }

  const existentes = await prisma.approvalTier.findMany();

  // Exatamente uma faixa ATIVA sem teto. Sem esta recusa, duas faixas
  // disputariam os valores altos e qual delas venceria dependeria da ordem de
  // leitura no banco, que não é garantida.
  if (maxValue === null && existentes.some((f) => f.active && f.maxValue === null)) {
    return NextResponse.json(
      { error: "Já existe uma faixa sem teto (a do topo). Defina um teto para esta, ou desative a outra antes." },
      { status: 409 },
    );
  }
  if (maxValue !== null && existentes.some((f) => f.active && f.maxValue !== null && Number(f.maxValue) === maxValue)) {
    return NextResponse.json({ error: "Já existe uma faixa ativa com esse mesmo teto." }, { status: 409 });
  }

  // `level` é identidade estável, nunca reaproveitada: o próximo número livre,
  // e não `contagem + 1`. Reaproveitar o número de uma faixa apagada faria
  // aprovações antigas apontarem para a faixa errada (ver o comentário do
  // modelo em schema.prisma).
  const proximoLevel = existentes.reduce((maior, f) => Math.max(maior, f.level), 0) + 1;

  const criada = await prisma.approvalTier.create({
    data: { level: proximoLevel, label, maxValue, requiredApprovers },
  });
  return NextResponse.json(criada, { status: 201 });
}
