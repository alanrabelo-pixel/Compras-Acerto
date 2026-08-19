import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { proximoCodigo } from "./codigo";

/**
 * Regressão dos três defeitos da geração de código sequencial.
 *
 * O código saía de `count() + 1` sobre a própria tabela, fora de transação:
 * duas criações simultâneas montavam o mesmo código e a segunda violava a
 * unicidade (erro 500, formulário perdido); o contador era global e não por
 * ano, então o prefixo de ano mentia a partir de janeiro; e apagar um registro
 * fazia o contador regredir e colidir de forma permanente.
 */

const PREFIXO = `TESTE${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

describe("proximoCodigo", () => {
  afterAll(async () => {
    await prisma.codeCounter.deleteMany({ where: { prefix: { startsWith: "TESTE" } } });
  });

  it("começa em 0001 e segue em ordem", async () => {
    expect(await proximoCodigo(PREFIXO, 2026)).toBe(`${PREFIXO}-2026-0001`);
    expect(await proximoCodigo(PREFIXO, 2026)).toBe(`${PREFIXO}-2026-0002`);
    expect(await proximoCodigo(PREFIXO, 2026)).toBe(`${PREFIXO}-2026-0003`);
  });

  it("reinicia a sequência a cada ano, em vez de continuar de onde parou", async () => {
    const p = `${PREFIXO}ANO`;
    await proximoCodigo(p, 2026);
    await proximoCodigo(p, 2026);

    // Antes o contador era global sobre a tabela, então a virada de ano
    // produzia PC-2027-0003, não PC-2027-0001.
    expect(await proximoCodigo(p, 2027)).toBe(`${p}-2027-0001`);
    expect(await proximoCodigo(p, 2026)).toBe(`${p}-2026-0003`);
  });

  it("não colide sob concorrência, que era a falha que perdia a solicitação", async () => {
    const p = `${PREFIXO}CORRIDA`;

    // Trinta gerações disparadas ao mesmo tempo. Com count()+1 elas leriam o
    // mesmo valor e produziriam códigos repetidos.
    const codigos = await Promise.all(Array.from({ length: 30 }, () => proximoCodigo(p, 2026)));

    expect(new Set(codigos).size).toBe(30);
    const sequenciais = codigos.map((c) => Number(c.split("-").pop())).sort((a, b) => a - b);
    expect(sequenciais).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it("não regride quando registros são apagados, porque não conta linhas", async () => {
    const p = `${PREFIXO}APAGA`;
    await proximoCodigo(p, 2026);
    await proximoCodigo(p, 2026);
    const terceiro = await proximoCodigo(p, 2026);
    expect(terceiro).toBe(`${p}-2026-0003`);

    // O contador é independente da quantidade de linhas na tabela de destino,
    // então apagar solicitações não faz o próximo código colidir com um já
    // emitido. O valor apenas segue adiante.
    expect(await proximoCodigo(p, 2026)).toBe(`${p}-2026-0004`);
  });

  it("mantém sequências separadas por prefixo", async () => {
    const a = `${PREFIXO}A`;
    const b = `${PREFIXO}B`;

    expect(await proximoCodigo(a, 2026)).toBe(`${a}-2026-0001`);
    expect(await proximoCodigo(b, 2026)).toBe(`${b}-2026-0001`);
    expect(await proximoCodigo(a, 2026)).toBe(`${a}-2026-0002`);
  });
});
