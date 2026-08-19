import { describe, it, expect, afterEach, vi } from "vitest";
import { verificarTokenDeMaquina } from "./segredos";

/**
 * Regressão da falha aberta nos tokens de máquina.
 *
 * O padrão anterior era comparar o cabeçalho contra a interpolação direta da
 * variável. Sem ela definida, o alvo virava a string "Bearer undefined", então
 * quem enviasse exatamente esse cabeçalho era autenticado: a ausência de
 * configuração virava credencial válida.
 */
describe("verificarTokenDeMaquina", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('recusa "Bearer undefined" quando a variável não está definida', () => {
    vi.stubEnv("CRON_SECRET", undefined);

    const r = verificarTokenDeMaquina("Bearer undefined", "CRON_SECRET");

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(503);
  });

  it("recusa qualquer credencial quando a variável não está definida", () => {
    vi.stubEnv("ERP_API_KEY", undefined);

    for (const tentativa of ["Bearer x", "Bearer ", "", "Bearer null"]) {
      const r = verificarTokenDeMaquina(tentativa, "ERP_API_KEY");
      expect(r.ok, tentativa).toBe(false);
    }
  });

  it("distingue erro de configuração (503) de credencial errada (401)", () => {
    vi.stubEnv("CRON_SECRET", undefined);
    const semConfig = verificarTokenDeMaquina("Bearer qualquer", "CRON_SECRET");
    expect(semConfig.ok).toBe(false);
    if (!semConfig.ok) expect(semConfig.status).toBe(503);

    vi.stubEnv("CRON_SECRET", "segredo-real");
    const credencialErrada = verificarTokenDeMaquina("Bearer errado", "CRON_SECRET");
    expect(credencialErrada.ok).toBe(false);
    if (!credencialErrada.ok) expect(credencialErrada.status).toBe(401);
  });

  it("recusa cabeçalho ausente", () => {
    vi.stubEnv("CRON_SECRET", "segredo-real");

    const r = verificarTokenDeMaquina(null, "CRON_SECRET");

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("recusa token de tamanho diferente sem lançar", () => {
    vi.stubEnv("CRON_SECRET", "segredo-real");

    // timingSafeEqual lança quando os tamanhos diferem; o comprimento é
    // comparado antes justamente para isso não virar erro 500.
    expect(() => verificarTokenDeMaquina("Bearer x", "CRON_SECRET")).not.toThrow();
    expect(verificarTokenDeMaquina("Bearer x", "CRON_SECRET").ok).toBe(false);
  });

  it("aceita a credencial correta", () => {
    vi.stubEnv("CRON_SECRET", "segredo-real");

    expect(verificarTokenDeMaquina("Bearer segredo-real", "CRON_SECRET").ok).toBe(true);
  });
});
