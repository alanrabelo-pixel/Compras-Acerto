import { mkdir, writeFile, readFile as fsReadFile } from "fs/promises";
import path from "path";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

/**
 * Armazenamento de anexos e fotos de perfil: dois modos, escolhidos
 * automaticamente pela presença de AWS_S3_BUCKET (ver .env.example).
 *
 * - Sem a variável (dev local, filesystem persistente): grava em disco,
 *   num diretório fora do controle de versão (`uploads/`), e guarda em
 *   Attachment.storageUrl/User.avatarUrl uma chave "local://<id>/<arquivo>"
 *   que readFile() resolve de volta para o caminho real.
 * - Com a variável (produção no EKS): usa um bucket S3 **privado**, nunca
 *   público e nunca com URL assinada. Toda leitura de arquivo já passa pela
 *   própria rota da aplicação (ver /api/attachments/[id]/file e
 *   /api/users/[id]/avatar; o navegador nunca fala com o storage
 *   diretamente), então o servidor busca o objeto com a própria credencial
 *   (IRSA do pod) e devolve os bytes, sem nunca expor uma URL do S3.
 *
 * ORIGEM: escrito pelo time de engenharia, e trazido inteiro para cá em
 * 25/08/2026. Substitui o Vercel Blob, removido junto com a saída da Vercel.
 *
 * A troca corrige, de quebra, um risco que o runbook de ambientes já
 * apontava: o Blob gravava em Attachment.storageUrl uma URL PÚBLICA e sem
 * expiração, então contrato assinado da Acerto ficava acessível a quem
 * tivesse o link, fora de qualquer controle de acesso do sistema. Com o
 * bucket privado, a permissão volta a ser a da aplicação.
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

  // ANEXO ANTIGO, DA ÉPOCA DO VERCEL BLOB.
  //
  // O Blob não guardava esquema próprio: gravava em Attachment.storageUrl a
  // URL pública inteira, "https://<algo>.public.blob.vercel-storage.com/...".
  // Toda linha criada antes da migração para o S3 está assim, e sem este
  // trecho ela caía no erro de esquema desconhecido logo abaixo: o anexo
  // continua listado na tela, e abrir devolve 500. Quem subiu o arquivo não
  // tem como saber que ele virou inacessível.
  //
  // Ler é seguro e não recria o risco antigo: a URL pública já existe e já
  // está gravada, e o que a substituição do storage corrige é a GRAVAÇÃO de
  // novas URLs assim, que saveFile() acima não faz mais. Enquanto os arquivos
  // não forem copiados para o bucket, este é o único caminho para eles.
  if (storageUrl.startsWith("https://")) {
    const resposta = await fetch(storageUrl);
    if (!resposta.ok) {
      throw new Error(
        `Anexo antigo (Vercel Blob) não pôde ser lido: ${resposta.status} em ${storageUrl}. ` +
          "Se o Blob já foi desligado, o arquivo precisa ser recuperado do backup e reenviado.",
      );
    }
    return Buffer.from(await resposta.arrayBuffer());
  }

  throw new Error(`storageUrl com esquema desconhecido (esperado local:// ou s3://): ${storageUrl}`);
}
