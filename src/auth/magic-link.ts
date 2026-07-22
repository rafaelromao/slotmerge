import { createHmac, timingSafeEqual } from "node:crypto";

import type { Clock } from "../system/clock";

export type MagicLinkTokenIssuerOptions = {
  baseUrl: string;
  clock: Clock;
  secret: string;
};

export type MagicLinkTokenInput = {
  inviteId?: string;
  userId?: string;
  email: string;
  expiresAt: Date;
  generation?: number;
};

export type MagicLinkToken = {
  token: string;
  magicLinkUrl: string;
  expiresAt: Date;
};

export type MagicLinkTokenPayload = {
  inviteId?: string;
  userId?: string;
  email: string;
  expiresAt: string;
  generation?: number;
};

export class MagicLinkTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MagicLinkTokenError";
  }
}

export type MagicLinkTokenIssuer = ReturnType<
  typeof createMagicLinkTokenIssuer
>;

export function createMagicLinkTokenIssuer({
  baseUrl,
  clock,
  secret,
}: MagicLinkTokenIssuerOptions) {
  return {
    issueMagicLinkToken(input: MagicLinkTokenInput): MagicLinkToken {
      const issuedAt = clock.now();
      const payload: Record<string, unknown> = {
        email: input.email,
        expiresAt: input.expiresAt.toISOString(),
        issuedAt: issuedAt.toISOString(),
        generation: input.generation ?? 0,
      };
      if (input.inviteId !== undefined) {
        payload.inviteId = input.inviteId;
      }
      if (input.userId !== undefined) {
        payload.userId = input.userId;
      }
      const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
      const signature = signPayload({ payloadEncoded, secret });
      const token = `${payloadEncoded}.${signature}`;
      const url = new URL("/sign-in/verify", baseUrl);
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

export function verifyMagicLinkToken(
  token: string,
  secret: string,
  clock: { now(): Date },
): MagicLinkTokenPayload {
  const payload = decodeMagicLinkTokenPayload(token, secret);

  const expiresAt = new Date(payload.expiresAt);
  if (isNaN(expiresAt.getTime()) || expiresAt <= clock.now()) {
    throw new MagicLinkTokenError("token_expired");
  }

  return payload;
}

export function decodeMagicLinkTokenPayload(
  token: string,
  secret: string,
): MagicLinkTokenPayload {
  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new MagicLinkTokenError("invalid_token");
  }

  const [payloadEncoded, signature] = parts;

  const expectedSignature = signPayload({ payloadEncoded, secret });
  if (!timingSafeStringEquals(signature, expectedSignature)) {
    throw new MagicLinkTokenError("invalid_token");
  }

  let payloadJson: string;
  try {
    payloadJson = Buffer.from(payloadEncoded, "base64url").toString("utf8");
  } catch {
    throw new MagicLinkTokenError("invalid_token");
  }

  let payload: MagicLinkTokenPayload;
  try {
    payload = JSON.parse(payloadJson) as MagicLinkTokenPayload;
  } catch {
    throw new MagicLinkTokenError("invalid_token");
  }

  if (
    typeof payload.email !== "string" ||
    typeof payload.expiresAt !== "string" ||
    (typeof payload.inviteId !== "string" && typeof payload.userId !== "string")
  ) {
    throw new MagicLinkTokenError("invalid_token");
  }

  if (
    payload.generation !== undefined &&
    typeof payload.generation !== "number"
  ) {
    throw new MagicLinkTokenError("invalid_token");
  }

  return payload;
}

export function timingSafeStringEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}
