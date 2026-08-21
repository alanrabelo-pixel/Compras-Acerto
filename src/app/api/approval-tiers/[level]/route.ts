import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exigirPapel } from "@/lib/acesso";

/**
 * Editar e remover uma faixa de alçada.
 *
 * REMOVER É DESATIVAR, salvo quando a faixa nunca foi usada. Approval.level e
 * ApprovalLevelApprover.level gravaram números; apagar uma faixa em uso
 * deixaria aprovações antigas apontando para uma alçada inexistente, e o
 * histórico passaria a mentir sobre quem podia decidir o quê. Desativada, a
 * faixa sai do cálculo e das telas e continua explicando o passado.
 */

async function faixaOu404(level: number) {
  if (!Number.isInteger(level)) return null;
  return prisma.approvalTier.findUnique({ where: { level } });
}

/**
 * Recusa qualquer operação que deixe a escada SEM FAIXA DO TOPO, ou sem faixa
 * nenhuma.
 *
 * Encontrado na verificação em navegador, apagando a faixa de topo em
 * desenvolvimento: a regra "nunca usada, pode apagar" disparou certo pela
 * própria lógica, e ninguém olhou que aquela era a única faixa sem teto. A
 * escada ficou aberta em cima, e toda compra acima do maior teto passaria a
 * não ter alçada, com a aprovação recusada por "nenhuma faixa cobre este
 * valor". Ruim de duas formas: quebra o fluxo, e a mensagem culpa o valor em
 * vez da configuração.
 *
 * @param tetoResultante o teto DEPOIS da operação; `undefined` quando a
 * operação remove a faixa.
 */
async function deixariaEscadaSemTopo(
  level: number,
  ativaResultante: boolean,
  tetoResultante: number | null | undefined,
): Promise<NextResponse | null> {
  const outrasAtivas = await prisma.approvalTier.findMany({
    where: { active: true, level: { not: level } },
    select: { label: true, maxValue: true },
  });

  const estaContinuaSendoTopo = ativaResultante && tetoResultante === null;
  if (estaContinuaSendoTopo) return null;

  if (outrasAtivas.length === 0) {
    return NextResponse.json(
      { error: "Esta é a única faixa ativa. Crie ou reative outra antes de mexer nesta." },
      { status: 409 },
    );
  }

  if (!outrasAtivas.some((f) => f.maxValue === null)) {
    return NextResponse.json(
      {
        error:
          "Esta é a faixa do topo, a única sem teto. Sem ela, compras acima do maior valor ficariam sem alçada e a " +
          "aprovação seria recusada. Antes de mexer nesta, marque outra faixa como a do topo.",
      },
      { status: 409 },
    );
  }

  return null;
}

export async function PATCH(req: NextRequest, { params }: { params: { level: string } }) {
  const barrado = await exigirPapel(["ADMIN"], "editar faixa de alçada");
  if (barrado) return barrado;

  const level = Number(params.level);
  const faixa = await faixaOu404(level);
  if (!faixa) return NextResponse.json({ error: "Faixa de alçada não encontrada." }, { status: 404 });

  const body = await req.json();
  const dados: { label?: string; maxValue?: number | null; requiredApprovers?: number; active?: boolean } = {};

  if (body.label !== undefined) {
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!label) return NextResponse.json({ error: "Informe o nome da faixa." }, { status: 400 });
    dados.label = label;
  }

  if (body.requiredApprovers !== undefined) {
    const n = Number(body.requiredApprovers);
    if (!Number.isInteger(n) || n < 1) {
      return NextResponse.json({ error: "O número de assinaturas precisa ser 1 ou mais." }, { status: 400 });
    }
    dados.requiredApprovers = n;
  }

  if (body.maxValue !== undefined) {
    const semTeto = body.maxValue === null || body.maxValue === "";
    const maxValue = semTeto ? null : Number(body.maxValue);
    if (maxValue !== null && (!Number.isFinite(maxValue) || maxValue <= 0)) {
      return NextResponse.json({ error: "O teto da faixa precisa ser um valor maior que zero." }, { status: 400 });
    }
    dados.maxValue = maxValue;
  }

  if (body.active !== undefined) dados.active = Boolean(body.active);

  // Mesma regra do POST, conferida contra o estado RESULTANTE: editar também
  // pode criar duas faixas do topo, e reativar uma faixa sem teto também.
  const ativaResultante = dados.active ?? faixa.active;
  const tetoResultante = dados.maxValue !== undefined ? dados.maxValue : (faixa.maxValue === null ? null : Number(faixa.maxValue));
  if (ativaResultante && tetoResultante === null) {
    const outraSemTeto = await prisma.approvalTier.findFirst({
      where: { active: true, maxValue: null, level: { not: level } },
    });
    if (outraSemTeto) {
      return NextResponse.json(
        { error: `Já existe uma faixa sem teto ativa ("${outraSemTeto.label}"). Só pode haver uma faixa do topo.` },
        { status: 409 },
      );
    }
  }

  const semTopoDepois = await deixariaEscadaSemTopo(level, ativaResultante, tetoResultante);
  if (semTopoDepois) return semTopoDepois;

  const atualizada = await prisma.approvalTier.update({ where: { level }, data: dados });
  return NextResponse.json(atualizada);
}

export async function DELETE(_req: NextRequest, { params }: { params: { level: string } }) {
  const barrado = await exigirPapel(["ADMIN"], "remover faixa de alçada");
  if (barrado) return barrado;

  const level = Number(params.level);
  const faixa = await faixaOu404(level);
  if (!faixa) return NextResponse.json({ error: "Faixa de alçada não encontrada." }, { status: 404 });

  // ANTES de decidir entre apagar e desativar. A ordem importa, e foi o que
  // errei na primeira versão: a checagem de "nunca usada" vinha primeiro e
  // apagava a faixa do topo sem olhar mais nada.
  const semTopo = await deixariaEscadaSemTopo(level, false, undefined);
  if (semTopo) return semTopo;

  const [aprovacoes, aprovadores] = await Promise.all([
    prisma.approval.count({ where: { level } }),
    prisma.approvalLevelApprover.count({ where: { level } }),
  ]);

  // Nunca usada: some de vez, e o número dela nem assim é reaproveitado (ver
  // o cálculo de proximoLevel no POST).
  if (aprovacoes === 0 && aprovadores === 0) {
    await prisma.approvalTier.delete({ where: { level } });
    return NextResponse.json({ removida: true, desativada: false });
  }

  if (!faixa.active) {
    return NextResponse.json({ removida: false, desativada: true, jaEstavaDesativada: true });
  }

  await prisma.approvalTier.update({ where: { level }, data: { active: false } });
  return NextResponse.json({
    removida: false,
    desativada: true,
    motivo: `A faixa já foi usada em ${aprovacoes} aprovação(ões) e tem ${aprovadores} aprovador(es) cadastrado(s), então foi desativada em vez de apagada, para o histórico continuar legível.`,
  });
}
