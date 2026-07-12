import { describe, expect, it } from "vitest";

import { createMagicLinkTokenIssuer, verifyMagicLinkToken } from "./magic-link";

describe("magic link token issuer", () => {
  it("issues a magic-link URL whose expiration matches the invite expiration", () => {
    const issuer = createMagicLinkTokenIssuer({
      clock: () => new Date("2026-07-12T00:00:00.000Z"),
      baseUrl: "https://slotmerge.example.com",
    });

    const expiresAt = new Date("2026-08-11T00:00:00.000Z");
    const result = issuer.issueMagicLinkToken({
      inviteId: "invite-1",
      email: "alice@example.com",
      expiresAt,
    });

    expect(result.token).toMatch(
      /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/,
    );
    expect(result.expiresAt).toEqual(expiresAt);
    expect(result.magicLinkUrl).toContain("/auth/magic-link/verify?");
    expect(result.magicLinkUrl).toContain("token=");
    expect(result.magicLinkUrl).toContain(encodeURIComponent(result.token));
  });

  it("verifies a freshly-issued token and rejects one whose expiration has passed", async () => {
    let now = new Date("2026-07-12T00:00:00.000Z");
    const issuer = createMagicLinkTokenIssuer({
      clock: () => now,
      baseUrl: "https://slotmerge.example.com",
    });

    const expiresAt = new Date("2026-07-13T00:00:00.000Z");
    const issued = issuer.issueMagicLinkToken({
      inviteId: "invite-1",
      email: "alice@example.com",
      expiresAt,
    });

    const fresh = await verifyMagicLinkToken(issued.token, {
      clock: () => now,
    });
    expect(fresh).toEqual({
      ok: true,
      inviteId: "invite-1",
      email: "alice@example.com",
      expiresAt,
    });

    now = new Date("2026-07-13T00:00:00.001Z");
    const expired = await verifyMagicLinkToken(issued.token, {
      clock: () => now,
    });
    expect(expired).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a tampered magic-link token", async () => {
    const issuer = createMagicLinkTokenIssuer({
      clock: () => new Date("2026-07-12T00:00:00.000Z"),
      baseUrl: "https://slotmerge.example.com",
    });

    const issued = issuer.issueMagicLinkToken({
      inviteId: "invite-1",
      email: "alice@example.com",
      expiresAt: new Date("2026-08-11T00:00:00.000Z"),
    });
    const [body, nonce, signature] = issued.token.split(".");
    const flippedChar = signature[0] === "A" ? "B" : "A";
    const tampered = `${body}.${nonce}.${flippedChar}${signature.slice(1)}`;

    const result = await verifyMagicLinkToken(tampered);
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });
});
