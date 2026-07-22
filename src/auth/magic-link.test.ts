import { describe, expect, it } from "vitest";

import { createMagicLinkTokenIssuer, verifyMagicLinkToken } from "./magic-link";

describe("magic link token issuer", () => {
  it("issues a magic-link URL whose expiration matches the invite expiration", () => {
    const issuer = createMagicLinkTokenIssuer({
      clock: { now: () => new Date("2026-07-12T00:00:00.000Z") },
      baseUrl: "https://slotmerge.example.com",
      secret: "test-magic-link-secret",
    });

    const expiresAt = new Date("2026-08-11T00:00:00.000Z");
    const result = issuer.issueMagicLinkToken({
      inviteId: "invite-1",
      email: "alice@example.com",
      expiresAt,
      generation: 2,
    });

    expect(result.token).toMatch(/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/);
    expect(result.expiresAt).toEqual(expiresAt);
    expect(result.magicLinkUrl).toMatch(
      /^https:\/\/slotmerge\.example\.com\/sign-in\/verify\?token=/,
    );
    expect(result.magicLinkUrl).toContain(encodeURIComponent(result.token));
  });

  it("embeds the expiration timestamp inside the token payload", () => {
    const issuer = createMagicLinkTokenIssuer({
      clock: { now: () => new Date("2026-07-12T00:00:00.000Z") },
      baseUrl: "https://slotmerge.example.com",
      secret: "test-magic-link-secret",
    });

    const expiresAt = new Date("2026-08-11T00:00:00.000Z");
    const result = issuer.issueMagicLinkToken({
      inviteId: "invite-1",
      email: "alice@example.com",
      expiresAt,
      generation: 2,
    });

    const [payloadEncoded, signature] = result.token.split(".");
    expect(typeof payloadEncoded).toBe("string");
    expect(typeof signature).toBe("string");
    const payloadJson = Buffer.from(payloadEncoded, "base64url").toString(
      "utf8",
    );
    const payload = JSON.parse(payloadJson) as unknown as Record<
      string,
      unknown
    >;
    expect(payload).toMatchObject({
      inviteId: "invite-1",
      email: "alice@example.com",
      expiresAt: "2026-08-11T00:00:00.000Z",
      generation: 2,
    });
    expect(signature.length).toBeGreaterThan(0);
  });
});

describe("magic link token verifier", () => {
  it("verifies a valid token and returns its payload", () => {
    const issuer = createMagicLinkTokenIssuer({
      clock: { now: () => new Date("2026-07-12T00:00:00.000Z") },
      baseUrl: "https://slotmerge.example.com",
      secret: "test-magic-link-secret",
    });
    const token = issuer.issueMagicLinkToken({
      inviteId: "invite-1",
      email: "alice@example.com",
      expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      generation: 1,
    });

    const payload = verifyMagicLinkToken(
      token.token,
      "test-magic-link-secret",
      { now: () => new Date("2026-07-15T00:00:00.000Z") },
    );

    expect(payload.inviteId).toBe("invite-1");
    expect(payload.email).toBe("alice@example.com");
    expect(payload.expiresAt).toBe("2026-08-11T00:00:00.000Z");
    expect(payload.generation).toBe(1);
  });

  it("throws InvalidToken for a token with wrong secret", () => {
    const issuer = createMagicLinkTokenIssuer({
      clock: { now: () => new Date("2026-07-12T00:00:00.000Z") },
      baseUrl: "https://slotmerge.example.com",
      secret: "correct-secret",
    });
    const token = issuer.issueMagicLinkToken({
      inviteId: "invite-1",
      email: "alice@example.com",
      expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      generation: 1,
    });

    expect(() =>
      verifyMagicLinkToken(token.token, "wrong-secret", {
        now: () => new Date("2026-07-15T00:00:00.000Z"),
      }),
    ).toThrow("invalid_token");
  });

  it("throws InvalidToken for a malformed token", () => {
    expect(() =>
      verifyMagicLinkToken("not-a-valid-token", "test-secret", {
        now: () => new Date(),
      }),
    ).toThrow("invalid_token");
  });

  it("throws TokenExpired for an expired token", () => {
    const issuer = createMagicLinkTokenIssuer({
      clock: { now: () => new Date("2026-07-12T00:00:00.000Z") },
      baseUrl: "https://slotmerge.example.com",
      secret: "test-magic-link-secret",
    });
    const token = issuer.issueMagicLinkToken({
      inviteId: "invite-1",
      email: "alice@example.com",
      expiresAt: new Date("2026-07-20T00:00:00.000Z"),
      generation: 1,
    });

    expect(() =>
      verifyMagicLinkToken(token.token, "test-magic-link-secret", {
        now: () => new Date("2026-07-25T00:00:00.000Z"),
      }),
    ).toThrow("token_expired");
  });
});
