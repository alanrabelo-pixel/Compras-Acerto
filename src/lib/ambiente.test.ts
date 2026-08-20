import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { ambienteAtual, ehProducao, rotuloDoAmbiente } from "@/lib/ambiente";
import { validarAmbiente } from "@/lib/env";

/**
 * A separação entre Produção e Sandbox é, no fim, convenção humana: dois
 * projetos, dois bancos, dois conjuntos de variáveis. Nada disso impede
 * ninguém de copiar a URL do banco de produção para o painel do Sandbox, e
 * essa cópia é o resultado padrão de provisionar um ambiente a partir do
 * outro, não uma exceção.
 *
 * Este arquivo cobre as duas únicas barreiras que não dependem de alguém
 * lembrar: o padrão seguro quando o ambiente não se declara, e a recusa de
 * subir numa combinação incoerente de ambiente e banco.
 */

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("ambienteAtual", () => {
  it("é produção só quando declarado explicitamente", () => {
    vi.stubEnv("APP_ENV", "producao");
    expect(ambienteAtual()).toBe("producao");
    expect(ehProducao()).toBe(true);
  });

  it("cai em sandbox quando a variável falta, que é o lado seguro", () => {
    vi.stubEnv("APP_ENV", "");
    expect(ambienteAtual()).toBe("sandbox");
    expect(ehProducao()).toBe(false);
  });

  it("cai em sandbox quando o valor é lixo, em vez de adivinhar", () => {
    // "production" em inglês, "prod", "PRODUÇÃO" com acento: nenhum vale. Um
    // valor que quase acerta é o caso mais perigoso, porque quem digitou
    // acredita ter declarado produção.
    for (const valor of ["production", "prod", "PRODUÇÃO", "sandbox2", "1"]) {
      vi.stubEnv("APP_ENV", valor);
      expect(ambienteAtual(), `APP_ENV=${valor}`).toBe("sandbox");
    }
  });

  it("aceita variação de caixa e espaço, que é erro de digitação e não de intenção", () => {
    for (const valor of ["PRODUCAO", " producao ", "Producao"]) {
      vi.stubEnv("APP_ENV", valor);
      expect(ambienteAtual(), `APP_ENV=${valor}`).toBe("producao");
    }
  });

  it("produção não tem rótulo, para a faixa não virar paisagem", () => {
    vi.stubEnv("APP_ENV", "producao");
    expect(rotuloDoAmbiente()).toBeNull();
    vi.stubEnv("APP_ENV", "sandbox");
    expect(rotuloDoAmbiente()).toBe("SANDBOX");
  });
});

describe("validarAmbiente: coerência entre ambiente e banco", () => {
  it("recusa subir como produção apontando para banco local", () => {
    vi.stubEnv("APP_ENV", "producao");
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5433/acerto");

    expect(() => validarAmbiente()).toThrow(/banco local/i);
  });

  it("recusa também com 127.0.0.1, que é o mesmo host escrito diferente", () => {
    vi.stubEnv("APP_ENV", "producao");
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@127.0.0.1:5433/acerto");

    expect(() => validarAmbiente()).toThrow(/banco local/i);
  });

  it("deixa passar produção com banco remoto", () => {
    vi.stubEnv("APP_ENV", "producao");
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@db.provedor.com:5432/acerto");
    vi.stubEnv("NODE_ENV", "development");

    expect(() => validarAmbiente()).not.toThrow();
  });

  it("deixa passar sandbox com banco local, que é o desenvolvimento de todo dia", () => {
    vi.stubEnv("APP_ENV", "sandbox");
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5433/acerto");

    expect(() => validarAmbiente()).not.toThrow();
  });

  it("continua exigindo DATABASE_URL antes de qualquer outra coisa", () => {
    vi.stubEnv("APP_ENV", "sandbox");
    vi.stubEnv("DATABASE_URL", "");

    expect(() => validarAmbiente()).toThrow(/DATABASE_URL/);
  });
});
