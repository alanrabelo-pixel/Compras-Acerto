import crypto from "crypto";

/**
 * Criptografia em repouso para segredos por usuário (hoje: User.anthropicApiKey
 * / geminiApiKey — ver /api/users/[id]/ai-keys). Antes desta mudança, essas
 * chaves ficavam em texto puro no banco (ASSUNÇÃO NÃO VERIFICADA sinalizada
 * no schema.prisma) — risco real antes de qualquer ambiente de produção.
 *
 * AES-256-GCM com chave derivada (SHA-256) de AI_KEY_ENCRYPTION_SECRET — uma
 * frase secreta comum, não um hex de 32 bytes gerado à mão, para ficar fácil
 * de configurar. Formato armazenado: "v1:<iv-hex>:<authTag-hex>:<ciphertext-hex>".
 *
 * ASSUNÇÃO NÃO VERIFICADA: para um ambiente de produção real, considerar um
 * cofre de segredos gerenciado (ex: AWS KMS/Secrets Manager, Vault) em vez de
 * uma chave só em variável de ambiente — ver relatório de modernização.
 */

const ALGORITHM = "aes-256-gcm";
const FORMAT_PREFIX = "v1";

function getKey(): Buffer {
  const secret = process.env.AI_KEY_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error(
      "AI_KEY_ENCRYPTION_SECRET não configurada — necessária para ler/gravar chaves de IA por usuário (ver .env.example)."
    );
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [FORMAT_PREFIX, iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

/**
 * Descriptografa um segredo salvo por encryptSecret(). Se o valor não estiver
 * no formato esperado (ex: uma chave salva antes desta mudança, ainda em
 * texto puro), devolve o valor original como veio — evita quebrar chaves já
 * configuradas; elas passam a ser criptografadas na próxima vez que a pessoa
 * salvar (PATCH em /api/users/[id]/ai-keys).
 */
export function decryptSecret(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== FORMAT_PREFIX) return stored;

  try {
    const [, ivHex, authTagHex, cipherHex] = parts;
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(cipherHex, "hex")), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return stored;
  }
}
