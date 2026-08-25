import { describe, it, expect, afterEach, vi } from "vitest";
import { register } from "./instrumentation";

/**
 * O CENÁRIO REAL QUE ESTES TESTES REPRODUZEM.
 *
 * Em 25/08/2026, ao integrar a infraestrutura do time de engenharia, ficou
 * claro que a produção em compras.acerto.com.br não define APP_ENV, APP_URL
 * nem AI_KEY_ENCRYPTION_SECRET: as três nasceram aqui em 19/08, depois de eles
 * terem partido, e o Dockerfile deles só define NODE_ENV, PORT e HOSTNAME.
 *
 * Sem APP_ENV, ambienteAtual() assume "sandbox", e a trava que recusa Sandbox
 * ligado a banco remoto sem marca de sandbox no nome dispara justamente contra
 * a produção de verdade, que é remota e não tem essa marca.
 *
 * O problema nunca foi a trava, que está certa. Era ONDE ela falhava: no
 * escopo de módulo de src/lib/auth.ts, ou seja, na primeira requisição
 * autenticada, depois de o Kubernetes já ter marcado o pod como pronto e
 * desligado os pods antigos. Aqui ela falha antes de o servidor aceitar
 * conexão, e o deploy malconfigurado não substitui o que está funcionando.
 */
describe("register (instrumentation)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("derruba a subida quando a produção não declara APP_ENV", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", undefined);
    vi.stubEnv("NODE_ENV", "production");
    // O banco real: remoto, e sem "sandbox" nem "sbx" no nome.
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@rds-postgresql-common.sa-east-1.rds.amazonaws.com:5432/acertocompras");
    vi.stubEnv("APP_ENV", undefined);

    await expect(register()).rejects.toThrowError(/sandbox/i);
  });

  it("sobe quando a produção se declara e tem os segredos", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", undefined);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@rds-postgresql-common.sa-east-1.rds.amazonaws.com:5432/acertocompras");
    vi.stubEnv("APP_ENV", "producao");
    vi.stubEnv("NEXTAUTH_SECRET", "x");
    vi.stubEnv("NEXTAUTH_URL", "https://compras.acerto.com.br");
    vi.stubEnv("GOOGLE_CLIENT_ID", "x");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "x");
    vi.stubEnv("AI_KEY_ENCRYPTION_SECRET", "x");
    vi.stubEnv("APP_URL", "https://compras.acerto.com.br");

    await expect(register()).resolves.toBeUndefined();
  });

  it("nomeia a variável que falta, para o erro no log do pod ser acionável", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", undefined);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@rds-postgresql-common.sa-east-1.rds.amazonaws.com:5432/acertocompras");
    vi.stubEnv("APP_ENV", "producao");
    vi.stubEnv("NEXTAUTH_SECRET", "x");
    vi.stubEnv("NEXTAUTH_URL", "https://compras.acerto.com.br");
    vi.stubEnv("GOOGLE_CLIENT_ID", "x");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "x");
    vi.stubEnv("AI_KEY_ENCRYPTION_SECRET", undefined);
    vi.stubEnv("APP_URL", undefined);

    await expect(register()).rejects.toThrowError(/AI_KEY_ENCRYPTION_SECRET/);
  });

  it("não roda no runtime edge, onde lançar derruba a aplicação inteira", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", undefined);

    await expect(register()).resolves.toBeUndefined();
  });

  it("não roda durante o build, que não tem segredo de produção por definição", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("APP_ENV", undefined);

    await expect(register()).resolves.toBeUndefined();
  });
});
