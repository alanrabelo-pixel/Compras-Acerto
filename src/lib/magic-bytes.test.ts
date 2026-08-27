import { describe, it, expect } from "vitest";
import { conteudoBateComExtensao } from "./magic-bytes";

/**
 * O caso que este arquivo protege é literalmente o do relatório de DAST de
 * 25/08/2026: um arquivo chamado "secure.png" cujo conteúdo real é texto
 * puro, aceito e armazenado sem checagem.
 */
describe("conteudoBateComExtensao", () => {
  it("recusa texto puro disfarçado de PNG (caso real do relatório de DAST)", () => {
    const buffer = Buffer.from("case randomblob(100000) when not null then 1 else 1 end");
    expect(conteudoBateComExtensao(buffer, "png")).toBe(false);
  });

  it("aceita um PNG de verdade", () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(conteudoBateComExtensao(buffer, "png")).toBe(true);
  });

  it("aceita um PDF de verdade e recusa PDF falso", () => {
    expect(conteudoBateComExtensao(Buffer.from("%PDF-1.4"), "pdf")).toBe(true);
    expect(conteudoBateComExtensao(Buffer.from("nao e pdf"), "pdf")).toBe(false);
  });

  it("aceita docx/xlsx real (assinatura ZIP) e recusa docx falso", () => {
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    expect(conteudoBateComExtensao(zip, "docx")).toBe(true);
    expect(conteudoBateComExtensao(zip, "xlsx")).toBe(true);
    expect(conteudoBateComExtensao(Buffer.from("nao e zip"), "docx")).toBe(false);
  });

  it("aceita WEBP real (RIFF + WEBP no offset 8) e recusa RIFF de outro tipo", () => {
    const webp = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from("WEBP"),
    ]);
    expect(conteudoBateComExtensao(webp, "webp")).toBe(true);
    const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WAVE")]);
    expect(conteudoBateComExtensao(wav, "webp")).toBe(false);
  });

  it("libera txt/csv/eml, que não têm assinatura verificável", () => {
    expect(conteudoBateComExtensao(Buffer.from("qualquer coisa"), "txt")).toBe(true);
    expect(conteudoBateComExtensao(Buffer.from("a,b,c"), "csv")).toBe(true);
  });

  it("libera extensão da allow-list sem assinatura cadastrada, por disponibilidade", () => {
    expect(conteudoBateComExtensao(Buffer.from("qualquer coisa"), "heic-legado-desconhecido")).toBe(true);
  });
});
