import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";

/**
 * Armazenamento de anexos — stand-in local para desenvolvimento.
 *
 * Assunção não verificada (ver README): em produção isso deve virar Google
 * Drive API (reaproveita contas de serviço do Workspace já usadas para
 * e-mail) ou um bucket S3-compatível. Aqui gravamos em disco, num diretório
 * fora do controle de versão (`uploads/`), e guardamos em
 * Attachment.storageUrl uma chave "local://<requestId>/<arquivo>" que o
 * endpoint de download resolve de volta para o caminho real — a mesma forma
 * como uma fileId do Drive ou uma key do S3 seriam guardadas.
 */

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

export async function saveLocalFile(requestId: string, fileName: string, buffer: Buffer): Promise<string> {
  const dir = path.join(UPLOAD_ROOT, requestId);
  await mkdir(dir, { recursive: true });
  const safeName = `${Date.now()}-${sanitizeFileName(fileName)}`;
  await writeFile(path.join(dir, safeName), buffer);
  return `local://${requestId}/${safeName}`;
}

export async function readLocalFile(storageUrl: string): Promise<Buffer> {
  if (!storageUrl.startsWith("local://")) {
    throw new Error("Arquivo não está armazenado localmente (storageUrl não reconhecida).");
  }
  const relative = storageUrl.replace("local://", "");
  return readFile(path.join(UPLOAD_ROOT, relative));
}
