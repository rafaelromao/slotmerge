import { createHash, randomBytes } from "node:crypto";

export type MagicLinkTokenIssuerOptions = {
  clock?: () => Date;
  baseUrl: string;
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

export type VerifyMagicLinkTokenOptions = {
  clock?: () => Date;
};

export type VerifyMagicLinkTokenResult =
  | {
      ok: true;
      inviteId: string;
      email: string;
      expiresAt: Date;
    }
  | { ok: false; reason: "expired" | "invalid" };

export function createMagicLinkTokenIssuer({
  clock = () => new Date(),
  baseUrl,
}: MagicLinkTokenIssuerOptions) {
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
      const nonce = randomBytes(16).toString("base64url");
      const signature = signPayload({
        payloadEncoded,
        secret: getMagicLinkSecret(),
      });
      const token = `${payloadEncoded}.${nonce}.${signature}`;
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

export function verifyMagicLinkToken(
  token: string,
  { clock = () => new Date() }: VerifyMagicLinkTokenOptions = {},
): Promise<VerifyMagicLinkTokenResult> {
  return Promise.resolve(verifyMagicLinkTokenSync(token, clock));
}

function verifyMagicLinkTokenSync(
  token: string,
  clock: () => Date,
): VerifyMagicLinkTokenResult {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, reason: "invalid" };
  }
  const [payloadEncoded, , signature] = parts;
  const expectedSignature = signPayload({
    payloadEncoded,
    secret: getMagicLinkSecret(),
  });
  if (!constantTimeEquals(signature, expectedSignature)) {
    return { ok: false, reason: "invalid" };
  }
  let payloadJson: string;
  try {
    payloadJson = base64UrlDecode(payloadEncoded);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!isMagicLinkPayload(payload)) {
    return { ok: false, reason: "invalid" };
  }
  const expiresAt = new Date(payload.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    return { ok: false, reason: "invalid" };
  }
  if (expiresAt.getTime() <= clock().getTime()) {
    return { ok: false, reason: "expired" };
  }
  return {
    ok: true,
    inviteId: payload.inviteId,
    email: payload.email,
    expiresAt,
  };
}

function isMagicLinkPayload(
  value: unknown,
): value is { inviteId: string; email: string; expiresAt: string } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.inviteId === "string" &&
    typeof candidate.email === "string" &&
    typeof candidate.expiresAt === "string"
  );
}

function signPayload({
  payloadEncoded,
  secret,
}: {
  payloadEncoded: string;
  secret: string;
}): string {
  return createHash("sha256")
    .update(`${secret}:${payloadEncoded}`)
    .digest("base64url");
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function getMagicLinkSecret(): string {
  if (process.env.MAGIC_LINK_SECRET) {
    return process.env.MAGIC_LINK_SECRET;
  }
  if (process.env.NODE_ENV === "test") {
    return "test-magic-link-secret-do-not-use-in-production";
  }
  return "local-magic-link-secret-do-not-use-in-production";
}
