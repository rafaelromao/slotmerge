import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

export function encryptCalendarToken({
  plaintext,
  key,
}: {
  plaintext: string;
  key: string;
}): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, deriveKey(key), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [iv, encrypted, authTag]
    .map((part) => part.toString("base64url"))
    .join(".");
}

export function decryptCalendarToken({
  ciphertext,
  key,
}: {
  ciphertext: string;
  key: string;
}): string {
  const [ivPart, encryptedPart, authTagPart] = ciphertext.split(".");
  if (!ivPart || !encryptedPart || !authTagPart) {
    throw new Error("Invalid encrypted calendar token payload.");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    deriveKey(key),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTagPart, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function deriveKey(key: string): Buffer {
  const keyBytes = Buffer.from(key, "utf8");

  if (keyBytes.length !== 32) {
    throw new Error("Calendar token encryption key must be 32 bytes.");
  }

  return keyBytes;
}
