import { describe, it, expect } from "vitest";
import { normalizarCnpj, formatarCnpj } from "./cnpj";

/**
 * O campo era texto livre, gravado do jeito que chegava. O @unique em
 * Supplier.cnpj não protege contra isso: para o banco, "00.000.000/0001-00" e
 * "00000000000100" são duas strings diferentes.
 *
 * O estrago não é cosmético. O anti-fracionamento soma os Pedidos de Compra
 * comparando o CNPJ por igualdade exata; com formatos divergentes a soma dá
 * zero e o risco nunca é sinalizado. O controle antifraude do módulo deixa de
 * funcionar sem que ninguém perceba.
 */
describe("normalizarCnpj", () => {
  it("reduz qualquer formatação ao mesmo valor, que é o ponto todo", () => {
    const esperado = "00000000000100";
    for (const entrada of [
      "00.000.000/0001-00",
      "00000000000100",
      "00 000 000 0001 00",
      " 00.000.000/0001-00 ",
      "00.000.000/0001.00",
    ]) {
      expect(normalizarCnpj(entrada), entrada).toBe(esperado);
    }
  });

  it("o mesmo fornecedor gravado de dois jeitos passa a bater", () => {
    // Antes: a importação de planilha gravava formatado e o formulário gravava
    // só dígitos, então a comparação por igualdade exata nunca encontrava nada.
    const daPlanilha = normalizarCnpj("11.222.333/0001-81");
    const doFormulario = normalizarCnpj("11222333000181");

    expect(daPlanilha).toBe(doFormulario);
  });

  it("devolve null quando não há dígito nenhum", () => {
    for (const entrada of [null, undefined, "", "   ", "não informado", "-/."]) {
      expect(normalizarCnpj(entrada), String(entrada)).toBeNull();
    }
  });
});

describe("formatarCnpj", () => {
  it("exibe no formato conhecido, a partir de qualquer entrada", () => {
    expect(formatarCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatarCnpj("11.222.333/0001-81")).toBe("11.222.333/0001-81");
  });

  it("mostra como está quando não tem 14 dígitos, em vez de inventar formatação", () => {
    // Um valor truncado precisa aparecer errado para alguém corrigir. Formatar
    // à força esconderia o problema.
    expect(formatarCnpj("112223330001")).toBe("112223330001");
  });

  it("devolve vazio quando não há valor", () => {
    expect(formatarCnpj(null)).toBe("");
    expect(formatarCnpj("")).toBe("");
  });
});
