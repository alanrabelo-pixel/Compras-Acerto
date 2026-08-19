import { describe, it, expect } from "vitest";
import { validarAnexo, TAMANHO_MAXIMO_ANEXO_BYTES } from "./upload";

/**
 * As duas rotas de anexo só checavam `file instanceof Blob`: nenhum limite de
 * tamanho, nenhuma checagem de tipo. A rota de foto de perfil já fazia as duas
 * coisas corretamente, então era inconsistência interna, não decisão.
 */

function arquivo(nome: string, bytes = 100, tipo = "application/octet-stream") {
  return new File([new Uint8Array(new ArrayBuffer(bytes))], nome, { type: tipo });
}

describe("validarAnexo", () => {
  it("aceita os formatos do dia a dia de compras", () => {
    for (const nome of [
      "contrato.pdf", "proposta.PDF", "planilha.xlsx", "orcamento.xls",
      "documento.docx", "nota.png", "foto.jpeg", "comprovante.heic",
      "email-do-fornecedor.msg", "pacote.zip", "dados.csv",
    ]) {
      expect(validarAnexo(arquivo(nome)).ok, nome).toBe(true);
    }
  });

  it("recusa arquivo que seria renderizado como página no armazenamento público", () => {
    // Em produção o Vercel Blob grava com acesso público e serve com o
    // Content-Type real, fora do controle das nossas rotas. Um .html ou .svg
    // seria executado ali.
    for (const nome of ["payload.html", "vetor.svg", "pagina.htm", "script.js", "app.xhtml"]) {
      const r = validarAnexo(arquivo(nome));
      expect(r.ok, nome).toBe(false);
      if (!r.ok) expect(r.status).toBe(400);
    }
  });

  it("recusa executável e script de sistema", () => {
    for (const nome of ["instalador.exe", "script.sh", "macro.bat", "lib.dll", "run.ps1"]) {
      expect(validarAnexo(arquivo(nome)).ok, nome).toBe(false);
    }
  });

  it("não se deixa enganar pelo MIME declarado, que vem do cliente", () => {
    // Diz ser PDF, mas a extensão determina como o arquivo é servido depois.
    const r = validarAnexo(arquivo("malicioso.html", 100, "application/pdf"));
    expect(r.ok).toBe(false);
  });

  it("recusa arquivo sem extensão", () => {
    expect(validarAnexo(arquivo("arquivo-sem-extensao")).ok).toBe(false);
  });

  it("recusa acima do limite de tamanho, com 413", () => {
    const r = validarAnexo(arquivo("grande.pdf", TAMANHO_MAXIMO_ANEXO_BYTES + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(413);
  });

  it("aceita exatamente no limite", () => {
    expect(validarAnexo(arquivo("no-limite.pdf", TAMANHO_MAXIMO_ANEXO_BYTES)).ok).toBe(true);
  });

  it("recusa arquivo vazio", () => {
    expect(validarAnexo(arquivo("vazio.pdf", 0)).ok).toBe(false);
  });

  it("recusa quando não veio arquivo nenhum", () => {
    for (const naoArquivo of [null, undefined, "texto", 42, {}]) {
      expect(validarAnexo(naoArquivo).ok).toBe(false);
    }
  });

  it("explica o que fazer, em vez de só recusar", () => {
    const r = validarAnexo(arquivo("payload.html"));
    if (!r.ok) {
      expect(r.erro).toContain("PDF");
      expect(r.erro).toContain(".html");
    }
  });
});
