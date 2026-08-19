import { mkdir, writeFile, readFile as fsReadFile } from "fs/promises";
import path from "path";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

/**
 * Armazenamento de anexos e fotos de perfil — dois modos, escolhidos
 * automaticamente pela presença de AWS_S3_BUCKET (ver .env.example):
 *
 * - Sem a variável (dev local, filesystem persistente): grava em disco,
 *   num diretório fora do controle de versão (`uploads/`), e guarda em
 *   Attachment.storageUrl/User.avatarUrl uma chave "local://<id>/<arquivo>"
 *   que readFile() resolve de volta para o caminho real.
 * - Com a variável (produção no EKS): usa um bucket S3 **privado** — nunca
 *   público, nem com URL assinada. Toda leitura de arquivo já passa pela
 *   própria rota da aplicação (ver /api/attachments/[id]/file e
 *   /api/users/[id]/avatar — o navegador nunca fala com o storage
 *   diretamente), então o servidor busca o objeto com a própria credencial
 *   (IRSA do pod) e devolve os bytes — sem nunca expor uma URL do S3.
 *
 * Substitui o Vercel Blob (removido — a app deixou de rodar na Vercel).
 */

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
const S3_BUCKET = process.env.AWS_S3_BUCKET;
const s3Client = S3_BUCKET
  ? new S3Client({ region: process.env.AWS_REGION || "sa-east-1" })
  : null;

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

export async function saveFile(requestId: string, fileName: string, buffer: Buffer): Promise<string> {
  const safeName = `${Date.now()}-${sanitizeFileName(fileName)}`;

  if (s3Client && S3_BUCKET) {
    const key = `${requestId}/${safeName}`;
    await s3Client.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: buffer }));
    return `s3://${key}`;
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

  if (storageUrl.startsWith("s3://")) {
    if (!s3Client || !S3_BUCKET) {
      throw new Error(
        `Referência S3 (${storageUrl}) encontrada, mas AWS_S3_BUCKET não está configurado neste ambiente.`,
      );
    }
    const key = storageUrl.replace("s3://", "");
    const response = await s3Client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    if (!response.Body) {
      throw new Error(`Objeto S3 sem conteúdo: ${key}`);
    }
    return Buffer.from(await response.Body.transformToByteArray());
  }

  throw new Error(`storageUrl com esquema desconhecido (esperado local:// ou s3://): ${storageUrl}`);
}
