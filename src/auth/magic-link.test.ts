import { describe, expect, it } from "vitest";

import { createMagicLinkTokenIssuer } from "./magic-link";

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

    expect(result.token).toMatch(/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/);
    expect(result.expiresAt).toEqual(expiresAt);
    expect(result.magicLinkUrl).toMatch(
      /^https:\/\/slotmerge\.example\.com\/auth\/magic-link\/verify\?token=/,
    );
    expect(result.magicLinkUrl).toContain(encodeURIComponent(result.token));
  });

  it("embeds the expiration timestamp inside the token payload", () => {
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
    });
    expect(signature.length).toBeGreaterThan(0);
  });
});
