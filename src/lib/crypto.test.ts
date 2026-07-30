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

  it("passes through gracefully if the ciphertext is corrupted/tampered", () => {
    const tampered = "v1:aabbcc:ddeeff:00112233";
    expect(decryptSecret(tampered)).toBe(tampered);
  });
});
