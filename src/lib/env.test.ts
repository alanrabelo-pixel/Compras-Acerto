import { describe, it, expect, afterEach, vi } from "vitest";
import { validarAmbiente } from "./env";

/**
 * Antes não havia validação nenhuma de ambiente. As 20 variáveis eram lidas
 * espalhadas pelo código e a ausência de cada uma se manifestava tarde e de um
 * jeito diferente, às vezes em silêncio (links de e-mail com "undefined",
 * anexos gravados em disco efêmero que somem no deploy seguinte).
 */
describe("validarAmbiente", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exige DATABASE_URL em qualquer ambiente", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", undefined);

    expect(() => validarAmbiente()).toThrowError(/DATABASE_URL/);
  });

  it("não exige o resto fora de produção, para não travar o desenvolvimento", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", "postgresql://x");
    vi.stubEnv("NEXTAUTH_SECRET", undefined);
    vi.stubEnv("GOOGLE_CLIENT_ID", undefined);

    expect(() => validarAmbiente()).not.toThrow();
  });

  it("derruba o boot em produção sem os segredos de autenticação", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://x");
    vi.stubEnv("NEXTAUTH_SECRET", undefined);

    expect(() => validarAmbiente()).toThrowError(/NEXTAUTH_SECRET/);
  });

  it("lista todas as ausentes de uma vez, em vez de uma por deploy", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://x");
    vi.stubEnv("NEXTAUTH_SECRET", undefined);
    vi.stubEnv("GOOGLE_CLIENT_ID", undefined);
    vi.stubEnv("APP_URL", undefined);

    try {
      validarAmbiente();
      expect.unreachable("deveria ter lançado");
    } catch (erro) {
      const mensagem = (erro as Error).message;
      expect(mensagem).toContain("NEXTAUTH_SECRET");
      expect(mensagem).toContain("GOOGLE_CLIENT_ID");
      expect(mensagem).toContain("APP_URL");
    }
  });

  it("apenas avisa sobre credencial de integração, sem derrubar o boot", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const nome of ["DATABASE_URL", "NEXTAUTH_SECRET", "NEXTAUTH_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "AI_KEY_ENCRYPTION_SECRET", "APP_URL"]) {
      vi.stubEnv(nome, "valor");
    }
    // Integração ausente degrada uma funcionalidade, e o sistema foi desenhado
    // para que integração falhe em silêncio sem travar o fluxo de compras.
    vi.stubEnv("SLACK_BOT_TOKEN", undefined);
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", undefined);

    expect(() => validarAmbiente()).not.toThrow();
  });
});
