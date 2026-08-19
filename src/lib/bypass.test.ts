import { describe, it, expect, afterEach, vi } from "vitest";
import { bypassAuthAtivo, assertBypassNaoEstaEmProducao } from "./bypass";

/**
 * A flag LOCAL_BYPASS_AUTH desliga autenticação E autorização. Antes ela era
 * lida direto de process.env em 16 pontos, sem trava nenhuma, e não constava do
 * .env.example: quem configurasse produção a partir do exemplo não tinha como
 * saber que precisava conferir se ela havia ficado ligada.
 */
describe("bypassAuthAtivo", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("é ignorada em produção, mesmo com a variável ligada", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOCAL_BYPASS_AUTH", "true");

    expect(bypassAuthAtivo()).toBe(false);
  });

  it("vale em desenvolvimento quando ligada", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LOCAL_BYPASS_AUTH", "true");

    expect(bypassAuthAtivo()).toBe(true);
  });

  it("é falsa quando a variável não está definida", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LOCAL_BYPASS_AUTH", undefined);

    expect(bypassAuthAtivo()).toBe(false);
  });

  it("só aceita a string exata true, não qualquer valor verdadeiro", () => {
    vi.stubEnv("NODE_ENV", "development");

    for (const valor of ["1", "yes", "TRUE", "sim", ""]) {
      vi.stubEnv("LOCAL_BYPASS_AUTH", valor);
      expect(bypassAuthAtivo(), `valor=${JSON.stringify(valor)}`).toBe(false);
    }
  });
});

describe("assertBypassNaoEstaEmProducao", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lança quando a flag sobe junto com produção", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOCAL_BYPASS_AUTH", "true");

    expect(() => assertBypassNaoEstaEmProducao()).toThrowError(/LOCAL_BYPASS_AUTH/);
  });

  it("não lança em produção sem a flag", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOCAL_BYPASS_AUTH", "false");

    expect(() => assertBypassNaoEstaEmProducao()).not.toThrow();
  });

  it("não lança em desenvolvimento com a flag ligada, que é o uso legítimo", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LOCAL_BYPASS_AUTH", "true");

    expect(() => assertBypassNaoEstaEmProducao()).not.toThrow();
  });
});
