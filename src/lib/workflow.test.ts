import { describe, it, expect } from "vitest";
import {
  nextAfterValidacaoOrcamentaria,
  budgetExceptionLevel,
  budgetExceptionApproverRole,
  approvalLevel,
  approvalsRequiredForLevel,
  nextAfterAprovacao,
  nextAfterAprovacaoGestor,
  nextAfterAguardandoEntrega,
  nextAfterTesouraria,
  slaDaysForDiretoria,
  isValidTransition,
  canPersonifyApprover,
  checkFragmentationRisk,
  minimumQuotesRequired,
  determineLane,
  requiresBasicVendorScreening,
  somarDiasUteis,
} from "./workflow";

describe("nextAfterValidacaoOrcamentaria", () => {
  it("stays on VALIDACAO_ORCAMENTARIA while budget is not ok (exception flow)", () => {
    expect(nextAfterValidacaoOrcamentaria({ budgetOk: false, demandType: "COMPRA_SERVICO" })).toBe(
      "VALIDACAO_ORCAMENTARIA"
    );
  });

  it("routes FERRAMENTA_NOVA to DUE_DILIGENCE when budget is ok", () => {
    expect(nextAfterValidacaoOrcamentaria({ budgetOk: true, demandType: "FERRAMENTA_NOVA" })).toBe(
      "DUE_DILIGENCE"
    );
  });

  it("does NOT route FERRAMENTA_UPGRADE_DOWNGRADE through Due Diligence", () => {
    expect(
      nextAfterValidacaoOrcamentaria({ budgetOk: true, demandType: "FERRAMENTA_UPGRADE_DOWNGRADE" })
    ).toBe("COTACAO");
  });

  it("routes every other demand type to COTACAO when budget is ok", () => {
    expect(nextAfterValidacaoOrcamentaria({ budgetOk: true, demandType: "COMPRA_PRODUTO" })).toBe(
      "COTACAO"
    );
  });
});

describe("budgetExceptionLevel", () => {
  it("is level 1 at and below R$5.000", () => {
    expect(budgetExceptionLevel(0)).toBe(1);
    expect(budgetExceptionLevel(5000)).toBe(1);
  });

  it("is level 2 just above R$5.000 and up to R$25.000", () => {
    expect(budgetExceptionLevel(5000.01)).toBe(2);
    expect(budgetExceptionLevel(25000)).toBe(2);
  });

  it("is level 3 above R$25.000", () => {
    expect(budgetExceptionLevel(25000.01)).toBe(3);
    expect(budgetExceptionLevel(1_000_000)).toBe(3);
  });
});

describe("budgetExceptionApproverRole", () => {
  it("requires COORDENACAO for level 1", () => {
    expect(budgetExceptionApproverRole(1)).toBe("COORDENACAO");
  });

  it("requires GERENTE_FNC for levels 2 and 3 (no CEO)", () => {
    expect(budgetExceptionApproverRole(2)).toBe("GERENTE_FNC");
    expect(budgetExceptionApproverRole(3)).toBe("GERENTE_FNC");
  });
});

describe("approvalLevel", () => {
  it("is level 1 at and below R$50.000", () => {
    expect(approvalLevel(50000)).toBe(1);
  });

  it("is level 2 just above R$50.000 and up to R$500.000", () => {
    expect(approvalLevel(50000.01)).toBe(2);
    expect(approvalLevel(500000)).toBe(2);
  });

  it("is level 3 above R$500.000", () => {
    expect(approvalLevel(500000.01)).toBe(3);
  });
});

describe("approvalsRequiredForLevel", () => {
  it("exige 1 aprovador no Nível 1", () => {
    expect(approvalsRequiredForLevel(1)).toBe(1);
  });

  it("exige 2 aprovadores nos Níveis 2 e 3", () => {
    expect(approvalsRequiredForLevel(2)).toBe(2);
    expect(approvalsRequiredForLevel(3)).toBe(2);
  });
});

describe("nextAfterAprovacao", () => {
  it("cancels the request when reproved, regardless of needsContract", () => {
    expect(nextAfterAprovacao({ approved: false, needsContract: true })).toBe("CANCELADO");
    expect(nextAfterAprovacao({ approved: false, needsContract: false })).toBe("CANCELADO");
  });

  it("routes to JURIDICO when approved and a contract is needed", () => {
    expect(nextAfterAprovacao({ approved: true, needsContract: true })).toBe("JURIDICO");
  });

  it("routes to PEDIDO_COMPRA when approved and no contract is needed", () => {
    expect(nextAfterAprovacao({ approved: true, needsContract: false })).toBe("PEDIDO_COMPRA");
  });
});

describe("nextAfterAprovacaoGestor", () => {
  it("routes to TRIAGEM when the cost center manager approves", () => {
    expect(nextAfterAprovacaoGestor({ approved: true })).toBe("TRIAGEM");
  });

  it("cancels the request when the cost center manager reproves", () => {
    expect(nextAfterAprovacaoGestor({ approved: false })).toBe("CANCELADO");
  });
});

describe("nextAfterAguardandoEntrega", () => {
  it("prioritizes MEDICAO over MAPEAMENTO_CONTRATO when both are needed", () => {
    expect(
      nextAfterAguardandoEntrega({ needsMeasurement: true, needsMapping: true })
    ).toBe("MEDICAO");
  });

  it("routes to MAPEAMENTO_CONTRATO when only mapping is needed", () => {
    expect(
      nextAfterAguardandoEntrega({ needsMeasurement: false, needsMapping: true })
    ).toBe("MAPEAMENTO_CONTRATO");
  });

  it("routes straight to CONCLUIDO when neither is needed", () => {
    expect(
      nextAfterAguardandoEntrega({ needsMeasurement: false, needsMapping: false })
    ).toBe("CONCLUIDO");
  });
});

describe("nextAfterTesouraria", () => {
  it("routes to MAPEAMENTO_CONTRATO when mapping is needed", () => {
    expect(nextAfterTesouraria({ needsMapping: true })).toBe("MAPEAMENTO_CONTRATO");
  });

  it("routes to CONCLUIDO when mapping is not needed", () => {
    expect(nextAfterTesouraria({ needsMapping: false })).toBe("CONCLUIDO");
  });
});

describe("slaDaysForDiretoria", () => {
  it("gives Corporativo 30 days and Revenue/Tecnologia 45 days by default", () => {
    expect(slaDaysForDiretoria("CORPORATIVO")).toBe(30);
    expect(slaDaysForDiretoria("REVENUE")).toBe(45);
    expect(slaDaysForDiretoria("TECNOLOGIA")).toBe(45);
  });

  it("halves the SLA (rounded up) for CRITICA priority", () => {
    expect(slaDaysForDiretoria("CORPORATIVO", "CRITICA")).toBe(15);
    expect(slaDaysForDiretoria("REVENUE", "CRITICA")).toBe(23);
  });

  it("does not change the SLA for non-critical priorities", () => {
    expect(slaDaysForDiretoria("CORPORATIVO", "ALTA")).toBe(30);
    expect(slaDaysForDiretoria("CORPORATIVO", "BAIXA")).toBe(30);
  });
});

describe("isValidTransition", () => {
  it("allows any stage to move to CANCELADO", () => {
    expect(isValidTransition("TRIAGEM", "CANCELADO")).toBe(true);
    expect(isValidTransition("TESOURARIA", "CANCELADO")).toBe(true);
  });

  it("allows a transition declared in STAGES[from].nextStages", () => {
    expect(isValidTransition("TRIAGEM", "VALIDACAO_ORCAMENTARIA")).toBe(true);
    expect(isValidTransition("TRIAGEM", "JURIDICO")).toBe(true);
  });

  it("rejects a transition that skips stages", () => {
    expect(isValidTransition("TRIAGEM", "PEDIDO_COMPRA")).toBe(false);
    expect(isValidTransition("SOLICITACAO", "APROVACAO")).toBe(false);
  });
});

describe("canPersonifyApprover", () => {
  it("allows personification only within approval level 1 (up to R$50.000)", () => {
    expect(canPersonifyApprover(50000)).toBe(true);
    expect(canPersonifyApprover(50000.01)).toBe(false);
    expect(canPersonifyApprover(1_000_000)).toBe(false);
  });
});

describe("checkFragmentationRisk", () => {
  it("flags when combining with prior purchases crosses into a higher approval level", () => {
    const result = checkFragmentationRisk({
      newRequestValue: 30000,
      priorRequestsValueLast12Months: 30000,
    });
    expect(result.individualLevel).toBe(1);
    expect(result.combinedLevel).toBe(2);
    expect(result.flagged).toBe(true);
  });

  it("does not flag when the combined value stays within the same approval level", () => {
    const result = checkFragmentationRisk({
      newRequestValue: 10000,
      priorRequestsValueLast12Months: 10000,
    });
    expect(result.individualLevel).toBe(1);
    expect(result.combinedLevel).toBe(1);
    expect(result.flagged).toBe(false);
  });
});

describe("minimumQuotesRequired", () => {
  it("requires a single quote at or below R$2.500", () => {
    expect(minimumQuotesRequired(2500)).toBe(1);
  });

  it("requires 3 competitive quotes above R$2.500", () => {
    expect(minimumQuotesRequired(2500.01)).toBe(3);
    expect(minimumQuotesRequired(1_000_000)).toBe(3);
  });
});

describe("determineLane", () => {
  const base = {
    estimatedValue: 1000,
    supplierApproved: true,
    supplierRiskTier: "BAIXO" as const,
    demandType: "COMPRA_PRODUTO" as const,
    handlesPersonalData: false,
  };

  it("is FAST for low value, approved, low-risk suppliers", () => {
    expect(determineLane(base)).toBe("FAST");
  });

  it("is STRATEGIC above R$500.000 regardless of other factors", () => {
    expect(determineLane({ ...base, estimatedValue: 600000 })).toBe("STRATEGIC");
  });

  it("is STRATEGIC for high supplier risk even at low value", () => {
    expect(determineLane({ ...base, supplierRiskTier: "ALTO" })).toBe("STRATEGIC");
  });

  it("routes personal-data-handling requests to STANDARD (or STRATEGIC above R$500k)", () => {
    expect(determineLane({ ...base, handlesPersonalData: true })).toBe("STANDARD");
    expect(
      determineLane({ ...base, handlesPersonalData: true, estimatedValue: 600000 })
    ).toBe("STRATEGIC");
  });

  it("routes FERRAMENTA_NOVA to STANDARD (or STRATEGIC above R$500k), same as personal data", () => {
    expect(determineLane({ ...base, demandType: "FERRAMENTA_NOVA" })).toBe("STANDARD");
  });

  it("does not fast-track a supplier that isn't approved or is medium risk", () => {
    expect(determineLane({ ...base, supplierApproved: false })).toBe("STANDARD");
    expect(determineLane({ ...base, supplierRiskTier: "MEDIO" })).toBe("STANDARD");
  });
});

describe("requiresBasicVendorScreening", () => {
  it("requires screening only for new suppliers", () => {
    expect(requiresBasicVendorScreening({ supplierIsNew: true })).toBe(true);
    expect(requiresBasicVendorScreening({ supplierIsNew: false })).toBe(false);
  });
});

describe("somarDiasUteis", () => {
  it("pula o fim de semana, que era o defeito do cálculo anterior", () => {
    // Quinta + 3 dias úteis = terça. Somando dias corridos daria domingo, e o
    // aprovador seria cobrado por um atraso que incluía o fim de semana.
    const quinta = new Date("2026-08-20T12:00:00");
    expect(quinta.getDay()).toBe(4);

    const prazo = somarDiasUteis(quinta, 3);

    expect(prazo.getDay()).toBe(2);
    expect(prazo.getDate()).toBe(25);
  });

  it("dentro da semana se comporta como dias corridos", () => {
    const segunda = new Date("2026-08-17T12:00:00");
    const prazo = somarDiasUteis(segunda, 3);
    expect(prazo.getDate()).toBe(20);
  });

  it("partindo de sexta, três dias úteis caem na quarta seguinte", () => {
    const sexta = new Date("2026-08-21T12:00:00");
    expect(sexta.getDay()).toBe(5);
    expect(somarDiasUteis(sexta, 3).getDay()).toBe(3);
  });

  it("não altera a data de origem", () => {
    const origem = new Date("2026-08-20T12:00:00");
    somarDiasUteis(origem, 5);
    expect(origem.getDate()).toBe(20);
  });
});
