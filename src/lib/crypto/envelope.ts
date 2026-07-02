/**
 * Envelope encryption for secrets at rest (connector credentials, etc.).
 * AES-256-GCM with a random IV per message and an authentication tag. The data
 * key comes from validated config (`CONNECTOR_ENCRYPTION_KEY`, base64 32 bytes);
 * a real deployment would wrap this with a KMS. Plaintext secrets are never
 * stored or logged.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "@/lib/env";
import { Errors } from "@/lib/errors";

const ALGO = "aes-256-gcm";
const KEY_ID = "env:v1";

export interface EncryptedBlob {
  keyId: string;
  iv: string; // base64
  tag: string; // base64
  ciphertext: string; // base64
}

function dataKey(): Buffer {
  const raw = env.CONNECTOR_ENCRYPTION_KEY;
  if (!raw) {
    if (env.NODE_ENV === "production") {
      throw Errors.config("CONNECTOR_ENCRYPTION_KEY is required in production");
    }
    // Deterministic dev key (32 bytes). Never used in production.
    return Buffer.alloc(32, 7);
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw Errors.config("CONNECTOR_ENCRYPTION_KEY must be base64-encoded 32 bytes");
  return key;
}

export function encryptSecret(plaintext: string): EncryptedBlob {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, dataKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    keyId: KEY_ID,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptSecret(blob: EncryptedBlob): string {
  const decipher = createDecipheriv(ALGO, dataKey(), Buffer.from(blob.iv, "base64"));
  decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/** Encrypt a JSON-serializable secrets object. */
export function encryptJson(value: unknown): EncryptedBlob {
  return encryptSecret(JSON.stringify(value));
}

/** Decrypt to a JSON object. */
export function decryptJson<T = unknown>(blob: EncryptedBlob): T {
  return JSON.parse(decryptSecret(blob)) as T;
}
