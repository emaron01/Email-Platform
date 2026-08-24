import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ENVELOPE_VERSION = "v1";

function encryptionKey(): Buffer {
  const encoded = process.env.MAILBOX_TOKEN_ENCRYPTION_KEY?.trim();
  if (!encoded) {
    throw new Error("MAILBOX_TOKEN_ENCRYPTION_KEY is required.");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error(
      "MAILBOX_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
    );
  }
  return key;
}

export function encryptMailboxSecret(value: string, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    ENVELOPE_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptMailboxSecret(envelope: string, aad: string): string {
  const [version, ivEncoded, tagEncoded, ciphertextEncoded, extra] =
    envelope.split(".");
  if (
    version !== ENVELOPE_VERSION ||
    !ivEncoded ||
    !tagEncoded ||
    !ciphertextEncoded ||
    extra
  ) {
    throw new Error("Encrypted mailbox secret has an invalid envelope.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivEncoded, "base64url"),
  );
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function mailboxSecretAad(input: {
  organizationId: string;
  userId: string;
  provider: "MICROSOFT_365";
  purpose: "access" | "refresh" | "pkce";
}): string {
  return [
    input.organizationId,
    input.userId,
    input.provider,
    input.purpose,
  ].join(":");
}
