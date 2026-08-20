import crypto from "crypto";
import { logger } from "@/lib/logger";

/**
 * Criptografia em repouso para segredos por usuário (hoje: User.anthropicApiKey
 * / geminiApiKey, ver /api/users/[id]/ai-keys). Antes desta mudança, essas
 * chaves ficavam em texto puro no banco (ASSUNÇÃO NÃO VERIFICADA sinalizada
 * no schema.prisma), um risco real antes de qualquer ambiente de produção.
 *
 * AES-256-GCM com chave derivada (SHA-256) de AI_KEY_ENCRYPTION_SECRET: uma
 * frase secreta comum, não um hex de 32 bytes gerado à mão, para ficar fácil
 * de configurar. Formato armazenado: "v1:<iv-hex>:<authTag-hex>:<ciphertext-hex>".
 *
 * ASSUNÇÃO NÃO VERIFICADA: para um ambiente de produção real, considerar um
 * cofre de segredos gerenciado (ex: AWS KMS/Secrets Manager, Vault) em vez de
 * uma chave só em variável de ambiente. Ver relatório de modernização.
 */

const ALGORITHM = "aes-256-gcm";
const FORMAT_PREFIX = "v1";

function getKey(): Buffer {
  const secret = process.env.AI_KEY_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error(
      "AI_KEY_ENCRYPTION_SECRET não configurada: necessária para ler/gravar chaves de IA por usuário (ver .env.example)."
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
 * Descriptografa um segredo salvo por encryptSecret().
 *
 * Valor fora do formato esperado é devolvido como veio: é uma chave salva
 * antes desta mudança, ainda em texto puro, e quebrá-la à toa não ajuda
 * ninguém. Ela passa a ser cifrada na próxima vez que a pessoa salvar.
 *
 * Já a falha de DECIFRAGEM devolve null, e essa distinção importa. Antes o
 * catch devolvia `stored`, ou seja, o texto cifrado seguia adiante como se
 * fosse a chave: a chamada de IA ia até o provedor com "v1:9f3a:..." no lugar
 * da credencial e voltava um erro de autenticação incompreensível, que não
 * aponta para a causa em lugar nenhum.
 *
 * A causa quase sempre é uma só, e vai ficar mais provável com dois ambientes:
 * AI_KEY_ENCRYPTION_SECRET diferente da que cifrou. É o caso de um dump do
 * banco de produção restaurado no Sandbox, que é justamente o que não se quer
 * que funcione em silêncio. Falhar fechado aqui transforma um mistério em uma
 * linha de log com o motivo.
 */
export function decryptSecret(stored: string): string | null {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== FORMAT_PREFIX) return stored;

  try {
    const [, ivHex, authTagHex, cipherHex] = parts;
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(cipherHex, "hex")), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    logger.warn("chave_de_ia_nao_decifrada", {
      causaProvavel:
        "AI_KEY_ENCRYPTION_SECRET diferente da que cifrou o valor. Acontece ao " +
        "restaurar um banco de outro ambiente ou ao trocar a variável. A pessoa " +
        "precisa salvar a chave de novo em Configurações.",
    });
    return null;
  }
}
