import { describe, it, expect } from "vitest";
import { gestoresParaAvisar, resumoParaOGestor } from "./alerta-centro-de-custo";

/**
 * Regras do alerta ao gestor do centro de custo. As duas que importam são
 * quem recebe e o que a mensagem diz, e nenhuma delas depende do Slack: por
 * isso ficam fora da rota, testadas direto.
 */

const BASE = {
  code: "PC-2026-0042",
  shortDescription: "Licenças de observabilidade",
  requesterName: "Mariana Flores",
  costCenterName: "Tecnologia",
  estimatedValue: 24000,
  priority: "MEDIA",
  demandType: "COMPRA_SERVICO",
  suggestedDeadline: new Date("2026-10-15T00:00:00Z"),
  extraBudget: false,
  linkDaSolicitacao: "https://compras.acerto.com.br/solicitacoes/abc123",
};

describe("gestoresParaAvisar", () => {
  const ana = { id: "u-ana", name: "Ana" };
  const bruno = { id: "u-bruno", name: "Bruno" };

  it("avisa todos os gestores quando quem abriu não é gestor", () => {
    expect(gestoresParaAvisar([ana, bruno], "u-carla")).toEqual([ana, bruno]);
  });

  it("não avisa o gestor que abriu a própria solicitação", () => {
    expect(gestoresParaAvisar([ana, bruno], "u-ana")).toEqual([bruno]);
  });

  it("devolve lista vazia quando o único gestor é quem abriu, e isso não é erro", () => {
    // Caso mais comum de todos: gestor abrindo no centro de custo que ele
    // administra sozinho. Ninguém para avisar é resultado legítimo.
    expect(gestoresParaAvisar([ana], "u-ana")).toEqual([]);
  });

  it("centro de custo sem gestor nenhum não quebra", () => {
    expect(gestoresParaAvisar([], "u-ana")).toEqual([]);
  });

  it("compara por id, não por nome ou posição", () => {
    const homonimo = { id: "u-outra-ana", name: "Ana" };
    expect(gestoresParaAvisar([ana, homonimo], "u-ana")).toEqual([homonimo]);
  });
});

describe("resumoParaOGestor", () => {
  it("traz o que um dono de orçamento pergunta primeiro", () => {
    const texto = resumoParaOGestor(BASE);

    expect(texto).toContain("PC-2026-0042");
    expect(texto).toContain("Licenças de observabilidade");
    expect(texto).toContain("Tecnologia");
    expect(texto).toContain("Mariana Flores");
    // Sem o "R$" na asserção de propósito: o Intl do pt-BR separa símbolo e
    // número com espaço NÃO separável (U+00A0), e comparar com espaço comum
    // falha por um motivo que não tem nada a ver com a regra sob teste.
    expect(texto).toContain("24.000,00");
    expect(texto).toContain(BASE.linkDaSolicitacao);
  });

  it("diz explicitamente que não é aprovação", () => {
    // O ponto mais importante da mensagem: sem esta frase, quem recebe fica
    // procurando um botão de aprovar que não existe, ou supõe que a compra
    // está parada esperando por ele.
    const texto = resumoParaOGestor(BASE);
    expect(texto).toContain("não um pedido de aprovação");
    expect(texto).toContain("já seguiu para a Triagem");
    expect(texto).toContain("não depende de nenhuma ação sua");
  });

  it("traduz tipo e prioridade em vez de vazar o enum", () => {
    const texto = resumoParaOGestor(BASE);
    expect(texto).not.toContain("COMPRA_SERVICO");
    expect(texto).not.toContain("MEDIA");
  });

  it("não inventa valor quando não foi informado", () => {
    const texto = resumoParaOGestor({ ...BASE, estimatedValue: null });
    expect(texto).toContain("não informado");
    expect(texto).not.toContain("R$ 0,00");
  });

  it("dá bloco próprio ao Orçamento Extra, com base, impacto e vigência", () => {
    const texto = resumoParaOGestor({
      ...BASE,
      extraBudget: true,
      extraBudgetBasis: "ANUAL",
      extraBudgetImpact: "RECORRENTE",
      extraBudgetStart: new Date("2027-01-01T00:00:00Z"),
      extraBudgetEnd: new Date("2027-12-31T00:00:00Z"),
    });

    expect(texto).toContain("Orçamento Extra");
    expect(texto).toContain("sem linha de orçamento prevista");
    expect(texto).toContain("por ano");
    expect(texto).toContain("Recorrente");
    expect(texto).toContain("Vigência");
  });

  it("não menciona Orçamento Extra quando a compra tem linha prevista", () => {
    expect(resumoParaOGestor(BASE)).not.toContain("Orçamento Extra");
  });

  it("aguenta Orçamento Extra sem o detalhamento, que é o caso das solicitações antigas", () => {
    const texto = resumoParaOGestor({ ...BASE, extraBudget: true });

    expect(texto).toContain("Orçamento Extra");
    // Sem vigência gravada, a linha simplesmente não existe, em vez de sair
    // "Vigência: undefined a undefined".
    expect(texto).not.toContain("Vigência");
    expect(texto).not.toContain("undefined");
  });
});
