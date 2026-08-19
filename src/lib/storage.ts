import { mkdir, writeFile, readFile as fsReadFile } from "fs/promises";
import path from "path";
import { put } from "@vercel/blob";

/**
 * Armazenamento de anexos e fotos de perfil: dois modos, escolhidos
 * automaticamente pela presença de BLOB_READ_WRITE_TOKEN (ver .env.example):
 *
 * - Sem o token (dev local, filesystem persistente): grava em disco, num
 *   diretório fora do controle de versão (`uploads/`), e guarda em
 *   Attachment.storageUrl/User.avatarUrl uma chave "local://<id>/<arquivo>"
 *   que readFile() resolve de volta para o caminho real.
 * - Com o token (produção na Vercel, onde o filesystem é efêmero: nada
 *   escrito em disco sobrevive entre requisições): usa o Vercel Blob e
 *   guarda a própria URL pública que ele retorna. readFile() só precisa
 *   buscar essa URL, sem nada a resolver.
 */

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

export async function saveFile(requestId: string, fileName: string, buffer: Buffer): Promise<string> {
  const safeName = `${Date.now()}-${sanitizeFileName(fileName)}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`${requestId}/${safeName}`, buffer, { access: "public" });
    return blob.url;
  }

  const dir = path.join(UPLOAD_ROOT, requestId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, safeName), buffer);
  return `local://${requestId}/${safeName}`;
}

export async function readFile(storageUrl: string): Promise<Buffer> {
  if (storageUrl.startsWith("local://")) {
    const relative = storageUrl.replace("local://", "");
    return fsReadFile(path.join(UPLOAD_ROOT, relative));
  }

  // URL do Vercel Blob (ou qualquer outra já pública): busca direto.
  const res = await fetch(storageUrl);
  if (!res.ok) throw new Error(`Não foi possível buscar o arquivo em ${storageUrl} (status ${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}
