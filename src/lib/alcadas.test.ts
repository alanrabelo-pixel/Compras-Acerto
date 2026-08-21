import { describe, it, expect } from "vitest";
import { faixaDoValor, ordenarFaixas, assinaturasExigidas, type Faixa } from "./alcadas";

/**
 * Escolha da faixa de alçada da Aprovação final.
 *
 * Era approvalLevel() em workflow.ts, com 50 mil e 500 mil no código. Virou
 * tabela em 21/08/2026 para o dono do sistema editar as faixas pela tela.
 * Estes casos são a regra pura; a tabela e as telas estão em
 * /api/approval-tiers e /admin/centros-de-custo.
 */

/** As três faixas que a migration semeou, iguais às constantes antigas. */
const PADRAO: Faixa[] = [
  { level: 1, label: "Nível 1 (até R$ 50 mil)", maxValue: 50000, requiredApprovers: 1 },
  { level: 2, label: "Nível 2 (até R$ 500 mil)", maxValue: 500000, requiredApprovers: 2 },
  { level: 3, label: "Nível 3 (acima de R$ 500 mil)", maxValue: null, requiredApprovers: 2 },
];

describe("faixaDoValor: as fronteiras que existiam antes seguem valendo", () => {
  it("até R$ 50.000 é a primeira faixa, e o valor do corte pertence a ela", () => {
    expect(faixaDoValor(PADRAO, 0)?.level).toBe(1);
    expect(faixaDoValor(PADRAO, 50000)?.level).toBe(1);
  });

  it("acima de R$ 50.000 e até R$ 500.000 é a segunda", () => {
    expect(faixaDoValor(PADRAO, 50000.01)?.level).toBe(2);
    expect(faixaDoValor(PADRAO, 500000)?.level).toBe(2);
  });

  it("acima de R$ 500.000 cai na faixa sem teto", () => {
    expect(faixaDoValor(PADRAO, 500000.01)?.level).toBe(3);
    expect(faixaDoValor(PADRAO, 99_000_000)?.level).toBe(3);
  });
});

describe("faixaDoValor: o que a tabela trouxe de novo", () => {
  it("não depende da ordem em que as faixas chegam", () => {
    // Vem de fetch no cliente: confiar na ordem do JSON é o tipo de suposição
    // que quebra em silêncio e cobra a alçada errada.
    const embaralhadas = [PADRAO[2], PADRAO[0], PADRAO[1]];
    expect(faixaDoValor(embaralhadas, 60000)?.level).toBe(2);
    expect(faixaDoValor(embaralhadas, 10)?.level).toBe(1);
    expect(faixaDoValor(embaralhadas, 9_000_000)?.level).toBe(3);
  });

  it("ordena pelo TETO, não pelo número da faixa", () => {
    // O caso que justifica a decisão de modelagem: `level` é identidade
    // estável, então uma faixa criada depois pode ter número alto e teto
    // baixo. Uma faixa de 25 mil criada como level 4 tem que cair ENTRE a 1
    // e a 2.
    const comFaixaNova: Faixa[] = [
      ...PADRAO,
      { level: 4, label: "Faixa intermediária", maxValue: 25000, requiredApprovers: 1 },
    ];
    expect(ordenarFaixas(comFaixaNova).map((f) => f.level)).toEqual([4, 1, 2, 3]);
    expect(faixaDoValor(comFaixaNova, 20000)?.level).toBe(4);
    expect(faixaDoValor(comFaixaNova, 30000)?.level).toBe(1);
  });

  it("devolve null quando não há faixa nenhuma, em vez de inventar um padrão", () => {
    // Aprovar como se fosse a menor alçada seria exatamente o erro que a
    // escada existe para impedir. Quem chama recusa a aprovação.
    expect(faixaDoValor([], 1000)).toBeNull();
  });

  it("devolve null quando nenhuma faixa cobre o valor", () => {
    // Escada sem faixa do topo: alguém desativou a sem-teto e deixou só as
    // limitadas. Um valor acima de todos os tetos não tem alçada.
    const semTopo: Faixa[] = [{ level: 1, label: "Única", maxValue: 1000, requiredApprovers: 1 }];
    expect(faixaDoValor(semTopo, 1000)?.level).toBe(1);
    expect(faixaDoValor(semTopo, 1000.01)).toBeNull();
  });

  it("uma faixa só, sem teto, cobre qualquer valor", () => {
    const unica: Faixa[] = [{ level: 7, label: "Tudo", maxValue: null, requiredApprovers: 3 }];
    expect(faixaDoValor(unica, 0)?.level).toBe(7);
    expect(faixaDoValor(unica, 10_000_000)?.level).toBe(7);
  });
});

describe("assinaturasExigidas", () => {
  it("vem da faixa, e não de regra fixa por número", () => {
    expect(assinaturasExigidas(PADRAO[0])).toBe(1);
    expect(assinaturasExigidas(PADRAO[1])).toBe(2);
  });

  it("aceita a quantidade que a pessoa configurar, inclusive acima de 2", () => {
    // O que a tabela destravou: antes era 1 no Nível 1 e 2 nos demais, sem
    // meio-termo nem teto.
    expect(assinaturasExigidas({ level: 9, label: "Alta", maxValue: null, requiredApprovers: 4 })).toBe(4);
  });

  it("sem faixa, devolve 1, que é o mínimo de exibição", () => {
    // Quem de fato cria a aprovação recusa antes de chegar aqui; este valor
    // existe para a tela não mostrar "undefined aprovadores".
    expect(assinaturasExigidas(null)).toBe(1);
  });
});

describe("ordenarFaixas", () => {
  it("não altera a lista recebida", () => {
    const original: Faixa[] = [PADRAO[2], PADRAO[0]];
    const copia = [...original];
    ordenarFaixas(original);
    expect(original).toEqual(copia);
  });
});
