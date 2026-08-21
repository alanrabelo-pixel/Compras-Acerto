import { prisma } from "@/lib/db";

/**
 * Faixas de alçada da APROVAÇÃO FINAL.
 *
 * Até 21/08/2026 isto era `approvalLevel()` em workflow.ts, com 50 mil e 500
 * mil escritos no código e o tipo `1 | 2 | 3` espalhado por toda parte. Virou
 * tabela para o dono do sistema poder incluir, editar e desativar faixas pela
 * tela (ver /admin/centros-de-custo e /api/approval-tiers).
 *
 * A separação aqui é deliberada: `faixaDoValor` é PURA e recebe as faixas
 * como argumento, e só `faixasAtivas` toca no banco. Sem isso, a escolha da
 * faixa viraria uma função assíncrona chamada de seis lugares, um deles
 * componente de cliente, e a regra de negócio ficaria impossível de testar
 * sem subir Postgres.
 */

export type Faixa = {
  level: number;
  label: string;
  /** Teto da faixa. `null` marca a faixa do topo, sem limite. */
  maxValue: number | null;
  requiredApprovers: number;
};

/**
 * A faixa que corresponde ao valor. PURA.
 *
 * Espera as faixas ordenadas por teto crescente, com a sem-teto por último,
 * que é como `faixasAtivas` devolve. Ordena de novo aqui mesmo assim: esta
 * função é chamada com dados vindos de um fetch no cliente, e depender da
 * ordem que o JSON chegou é o tipo de suposição que quebra em silêncio e sai
 * cobrando a alçada errada.
 *
 * Devolve null quando não há faixa nenhuma, e quem chama decide o que fazer.
 * Não inventamos um padrão: sem faixa configurada, o certo é recusar a
 * aprovação com uma mensagem, não aprovar tudo como se fosse Nível 1.
 */
export function faixaDoValor(faixas: Faixa[], valor: number): Faixa | null {
  const ordenadas = ordenarFaixas(faixas);
  return ordenadas.find((f) => f.maxValue === null || valor <= f.maxValue) ?? null;
}

/** Teto crescente, sem-teto por último. */
export function ordenarFaixas(faixas: Faixa[]): Faixa[] {
  return [...faixas].sort((a, b) => {
    if (a.maxValue === null) return 1;
    if (b.maxValue === null) return -1;
    return a.maxValue - b.maxValue;
  });
}

/**
 * Quantas assinaturas distintas a faixa exige. Fora daqui só para não
 * espalhar `?? 1` por quem chama: faixa ausente é 1, o mínimo seguro de
 * exibição, e quem de fato cria a aprovação recusa antes de chegar nisso.
 */
export function assinaturasExigidas(faixa: Faixa | null): number {
  return faixa?.requiredApprovers ?? 1;
}

/** Todas as faixas ATIVAS, já na ordem de cálculo. Servidor. */
export async function faixasAtivas(): Promise<Faixa[]> {
  const linhas = await prisma.approvalTier.findMany({
    where: { active: true },
    orderBy: [{ maxValue: { sort: "asc", nulls: "last" } }],
  });
  return linhas.map(paraFaixa);
}

/** Inclui as desativadas, para a tela de administração e o histórico. */
export async function todasAsFaixas(): Promise<(Faixa & { active: boolean })[]> {
  const linhas = await prisma.approvalTier.findMany({
    orderBy: [{ maxValue: { sort: "asc", nulls: "last" } }],
  });
  return linhas.map((l) => ({ ...paraFaixa(l), active: l.active }));
}

function paraFaixa(l: {
  level: number;
  label: string;
  maxValue: unknown;
  requiredApprovers: number;
}): Faixa {
  return {
    level: l.level,
    label: l.label,
    // Decimal do Prisma não atravessa a fronteira Server → Client Component,
    // e comparação de Decimal com number não funciona. Convertido na origem.
    maxValue: l.maxValue === null ? null : Number(l.maxValue),
    requiredApprovers: l.requiredApprovers,
  };
}
