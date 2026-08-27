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
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5433/acerto");
    vi.stubEnv("NEXTAUTH_SECRET", undefined);
    vi.stubEnv("GOOGLE_CLIENT_ID", undefined);

    expect(() => validarAmbiente()).not.toThrow();
  });

  it("derruba o boot em produção sem os segredos de autenticação", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5433/acerto");
    vi.stubEnv("NEXTAUTH_SECRET", undefined);

    expect(() => validarAmbiente()).toThrowError(/NEXTAUTH_SECRET/);
  });

  it("lista todas as ausentes de uma vez, em vez de uma por deploy", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5433/acerto");
    vi.stubEnv("NEXTAUTH_SECRET", undefined);
    vi.stubEnv("GOOGLE_CLIENT_ID", undefined);
    vi.stubEnv("NEXTAUTH_URL", undefined);

    try {
      validarAmbiente();
      expect.unreachable("deveria ter lançado");
    } catch (erro) {
      const mensagem = (erro as Error).message;
      expect(mensagem).toContain("NEXTAUTH_SECRET");
      expect(mensagem).toContain("GOOGLE_CLIENT_ID");
      expect(mensagem).toContain("NEXTAUTH_URL");
    }
  });

  /**
   * APP_URL e AI_KEY_ENCRYPTION_SECRET saíram das obrigatórias em 25/08/2026.
   * Nenhuma das duas guarda a porta: a primeira quebra links de e-mail, a
   * segunda desliga a chave de IA por usuário. Derrubar a produção inteira por
   * causa delas era desproporcional, e foi o que impediu a primeira implantação.
   */
  it("não derruba o boot por APP_URL nem pela chave de IA, que só degradam", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "producao");
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@rds.sa-east-1.rds.amazonaws.com:5432/acertocompras");
    vi.stubEnv("NEXTAUTH_SECRET", "x");
    vi.stubEnv("NEXTAUTH_URL", "https://compras.acerto.com.br");
    vi.stubEnv("GOOGLE_CLIENT_ID", "x");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "x");
    vi.stubEnv("APP_URL", undefined);
    vi.stubEnv("AI_KEY_ENCRYPTION_SECRET", undefined);

    expect(() => validarAmbiente()).not.toThrow();
  });

  it("apenas avisa sobre credencial de integração, sem derrubar o boot", () => {
    vi.stubEnv("NODE_ENV", "production");
    // APP_ENV explícito e uma URL de banco coerente com ele: sem isso, a
    // checagem de coerência (ambiente x banco) barra antes de chegar na parte
    // que este teste quer exercer, e o teste passaria a medir outra coisa.
    vi.stubEnv("APP_ENV", "producao");
    for (const nome of ["NEXTAUTH_SECRET", "NEXTAUTH_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "AI_KEY_ENCRYPTION_SECRET", "APP_URL"]) {
      vi.stubEnv(nome, "valor");
    }
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@db.provedor.com:5432/acerto");
    // Integração ausente degrada uma funcionalidade, e o sistema foi desenhado
    // para que integração falhe em silêncio sem travar o fluxo de compras.
    vi.stubEnv("SLACK_BOT_TOKEN", undefined);
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", undefined);

    expect(() => validarAmbiente()).not.toThrow();
  });
});
