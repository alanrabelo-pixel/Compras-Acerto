import { describe, it, expect, vi, afterEach } from "vitest";
import { readFile } from "@/lib/storage";

/**
 * O caso que estes testes protegem é o da MIGRAÇÃO, não o do dia a dia.
 *
 * A troca do Vercel Blob pelo S3 (25/08/2026) mudou o que vai para
 * Attachment.storageUrl: antes era a URL pública inteira, agora é uma chave
 * "s3://". As linhas antigas continuam no banco com o formato antigo, e
 * readFile() precisa saber ler as duas — senão o anexo segue aparecendo na
 * tela e abrir devolve 500, sem que ninguém saiba que ficou inacessível.
 */
describe("readFile com anexo antigo do Vercel Blob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("busca a URL pública gravada antes da migração para o S3", async () => {
    const conteudo = Buffer.from("contrato assinado");
    const fetchFalso = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => conteudo.buffer.slice(conteudo.byteOffset, conteudo.byteOffset + conteudo.byteLength),
    });
    vi.stubGlobal("fetch", fetchFalso);

    const url = "https://abc123.public.blob.vercel-storage.com/req-1/contrato.pdf";
    const bytes = await readFile(url);

    expect(fetchFalso).toHaveBeenCalledWith(url);
    expect(bytes.toString()).toBe("contrato assinado");
  });

  it("diz o que fazer quando o Blob já foi desligado, em vez de falhar mudo", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(
      readFile("https://abc123.public.blob.vercel-storage.com/req-1/sumiu.pdf"),
    ).rejects.toThrow(/404/);
    await expect(
      readFile("https://abc123.public.blob.vercel-storage.com/req-1/sumiu.pdf"),
    ).rejects.toThrow(/backup/);
  });

  it("continua recusando esquema que não é nenhum dos três", async () => {
    await expect(readFile("ftp://servidor/arquivo.pdf")).rejects.toThrow(/esquema desconhecido/);
  });
});
