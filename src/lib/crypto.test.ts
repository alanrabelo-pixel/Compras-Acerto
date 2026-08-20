import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "./crypto";

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a plaintext secret", () => {
    const plain = "sk-ant-api03-fake-key-value";
    const encrypted = encryptSecret(plain);
    expect(encrypted).not.toBe(plain);
    expect(decryptSecret(encrypted)).toBe(plain);
  });

  it("produces a different ciphertext each time (random IV) for the same input", () => {
    const plain = "same-secret";
    expect(encryptSecret(plain)).not.toBe(encryptSecret(plain));
  });

  it("passes through a value that isn't in the encrypted format (legacy plaintext key)", () => {
    const legacyPlaintext = "sk-legacy-key-stored-before-encryption-existed";
    expect(decryptSecret(legacyPlaintext)).toBe(legacyPlaintext);
  });

  it("devolve null quando não consegue decifrar, em vez de deixar o cifrado passar", () => {
    // Este teste já afirmou o contrário. A falha aberta mandava o texto
    // cifrado adiante como se fosse a chave, e a chamada de IA voltava um erro
    // de autenticação que não aponta para a causa. A causa quase sempre é
    // AI_KEY_ENCRYPTION_SECRET diferente da que cifrou, o que fica mais comum
    // com dois ambientes: banco de produção restaurado no Sandbox.
    const adulterado = "v1:aabbcc:ddeeff:00112233";
    expect(decryptSecret(adulterado)).toBeNull();
  });

  it("valor fora do formato segue passando, que é a chave legada em texto puro", () => {
    expect(decryptSecret("sk-ant-chave-antiga-sem-prefixo")).toBe("sk-ant-chave-antiga-sem-prefixo");
  });
});
