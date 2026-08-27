import { describe, it, expect, afterEach, vi } from "vitest";
import { register } from "./instrumentation";

/**
 * O CENÁRIO REAL QUE ESTES TESTES REPRODUZEM.
 *
 * Em 25/08/2026, ao integrar a infraestrutura do time de engenharia, ficou claro
 * que a produção em compras.acerto.com.br não define APP_ENV nem APP_URL: as
 * duas nasceram aqui em 19/08, depois de eles terem partido, e o Dockerfile
 * deles só define NODE_ENV, PORT e HOSTNAME.
 *
 * Sem APP_ENV, ambienteAtual() assume "sandbox", e a trava que recusa Sandbox
 * ligado a banco remoto sem marca de sandbox no nome dispara justamente contra a
 * produção de verdade, que é remota e não tem essa marca.
 *
 * O QUE ESTES TESTES GARANTEM, e que a primeira versão desta correção NÃO fazia:
 * que o processo ENCERRE. Lançar não basta. Medido no standalone real: o Next 14
 * registra "Failed to prepare server", imprime "Ready" logo abaixo, segue vivo,
 * aceita conexão TCP e responde 500 em toda rota. Para o Kubernetes isso é um pod
 * saudável, e os pods antigos são desligados em cima de um servidor quebrado.
 */
describe("register (instrumentation)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** Ambiente de produção corretamente declarado e completo. */
  function producaoCompleta() {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", undefined);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@rds-postgresql-common.sa-east-1.rds.amazonaws.com:5432/acertocompras");
    vi.stubEnv("APP_ENV", "producao");
    vi.stubEnv("NEXTAUTH_SECRET", "x");
    vi.stubEnv("NEXTAUTH_URL", "https://compras.acerto.com.br");
    vi.stubEnv("GOOGLE_CLIENT_ID", "x");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "x");
    vi.stubEnv("APP_URL", "https://compras.acerto.com.br");
  }

  it("ENCERRA O PROCESSO quando um segredo de autenticação falta", async () => {
    producaoCompleta();
    vi.stubEnv("NEXTAUTH_SECRET", undefined);
    const sair = vi.fn();

    await register(sair);

    expect(sair).toHaveBeenCalledWith(1);
  });

  it("encerra quando o ambiente SE DECLARA sandbox ligado a banco remoto", async () => {
    producaoCompleta();
    vi.stubEnv("APP_ENV", "sandbox");
    const sair = vi.fn();

    await register(sair);

    expect(sair).toHaveBeenCalledWith(1);
  });

  /**
   * O caso que derrubou a primeira implantação, em 25/08/2026: o overlay do
   * Kubernetes do time de engenharia nasceu antes de APP_ENV existir, e o
   * silêncio dele era lido como "declarei que sou Sandbox". Silêncio agora vira
   * aviso, não recusa. A trava acima continua valendo para quem se declara.
   */
  it("SOBE, com aviso, quando ninguém declarou APP_ENV", async () => {
    producaoCompleta();
    vi.stubEnv("APP_ENV", undefined);
    const sair = vi.fn();

    await register(sair);

    expect(sair).not.toHaveBeenCalled();
  });

  it("sobe sem APP_URL, que só degrada funcionalidade", async () => {
    producaoCompleta();
    vi.stubEnv("APP_URL", undefined);
    const sair = vi.fn();

    await register(sair);

    expect(sair).not.toHaveBeenCalled();
  });

  it("escreve o motivo antes de morrer, para o log do pod ser acionável", async () => {
    producaoCompleta();
    vi.stubEnv("NEXTAUTH_SECRET", undefined);
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});

    await register(vi.fn());

    const escrito = erro.mock.calls.map((c) => String(c[0])).join("\n");
    expect(escrito).toMatch(/NEXTAUTH_SECRET/);
    expect(escrito).toMatch(/NAO VAI SUBIR/);
    erro.mockRestore();
  });

  it("deixa subir quando a produção se declara e está completa", async () => {
    producaoCompleta();
    const sair = vi.fn();

    await register(sair);

    expect(sair).not.toHaveBeenCalled();
  });

  it("não roda no runtime edge, onde encerrar derruba a aplicação inteira", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", undefined);
    const sair = vi.fn();

    await register(sair);

    expect(sair).not.toHaveBeenCalled();
  });

  it("não roda durante o build, que não tem segredo de produção por definição", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("APP_ENV", undefined);
    const sair = vi.fn();

    await register(sair);

    expect(sair).not.toHaveBeenCalled();
  });
});
