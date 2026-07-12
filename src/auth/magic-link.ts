import { createHmac, timingSafeEqual } from "node:crypto";

export type MagicLinkTokenIssuerOptions = {
  baseUrl: string;
  clock?: () => Date;
  secret?: string;
};

export type MagicLinkTokenInput = {
  inviteId: string;
  email: string;
  expiresAt: Date;
};

export type MagicLinkToken = {
  token: string;
  magicLinkUrl: string;
  expiresAt: Date;
};

export function createMagicLinkTokenIssuer({
  baseUrl,
  clock = () => new Date(),
  secret,
}: MagicLinkTokenIssuerOptions) {
  const signingSecret = secret ?? resolveMagicLinkSecret();
  return {
    issueMagicLinkToken(input: MagicLinkTokenInput): MagicLinkToken {
      const issuedAt = clock();
      const payload = {
        inviteId: input.inviteId,
        email: input.email,
        expiresAt: input.expiresAt.toISOString(),
        issuedAt: issuedAt.toISOString(),
      };
      const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
      const signature = signPayload({
        payloadEncoded,
        secret: signingSecret,
      });
      const token = `${payloadEncoded}.${signature}`;
      const url = new URL("/auth/magic-link/verify", baseUrl);
      url.searchParams.set("token", token);
      return {
        token,
        magicLinkUrl: url.toString(),
        expiresAt: input.expiresAt,
      };
    },
  };
}

function signPayload({
  payloadEncoded,
  secret,
}: {
  payloadEncoded: string;
  secret: string;
}): string {
  return createHmac("sha256", secret)
    .update(payloadEncoded)
    .digest("base64url");
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function timingSafeStringEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

function resolveMagicLinkSecret(): string {
  const envSecret = process.env.MAGIC_LINK_SECRET;
  if (envSecret) {
    return envSecret;
  }
  if (process.env.NODE_ENV === "test") {
    return "test-magic-link-secret-do-not-use-in-production";
  }
  throw new Error("MAGIC_LINK_SECRET is required outside local/test runtime");
}
