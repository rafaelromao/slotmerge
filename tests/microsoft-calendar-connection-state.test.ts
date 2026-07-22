import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import Iron from "@hapi/iron";

import {
  sealCalendarConnectionState,
  unsealCalendarConnectionState,
} from "../src/calendar/connection";

describe("sealCalendarConnectionState", () => {
  it("seals the exact versioned OAuth state with a CSRF hash instead of the raw token", async () => {
    const sealed = await sealCalendarConnectionState({
      provider: "microsoft",
      connectionId: "connection-1",
      sessionId: "session-1",
      csrfToken: "csrf-token-1",
      codeVerifier: "code-verifier-1",
      issuedAt: new Date("2026-07-12T12:00:00.000Z"),
      expiresAt: new Date("2026-07-12T12:05:00.000Z"),
      returnTo: "/me/calendar-connections",
      secret: "0123456789abcdef0123456789abcdef",
    });

    expect(sealed).not.toBe("");
    const unsealed = (await Iron.unseal(
      sealed,
      "0123456789abcdef0123456789abcdef",
      Iron.defaults,
    )) as Record<string, unknown>;

    expect(unsealed).toEqual({
      version: 1,
      provider: "microsoft",
      connectionId: "connection-1",
      sessionId: "session-1",
      csrfTokenHash: createHash("sha256")
        .update("csrf-token-1")
        .digest("base64url"),
      codeVerifier: "code-verifier-1",
      issuedAt: "2026-07-12T12:00:00.000Z",
      expiresAt: "2026-07-12T12:05:00.000Z",
      returnTo: "/me/calendar-connections",
    });
    expect(JSON.stringify(unsealed)).not.toContain("csrf-token-1");
  });

  it("rejects a sealed state with unknown fields", async () => {
    const secret = "0123456789abcdef0123456789abcdef";
    const state = await Iron.seal(
      {
        version: 1,
        provider: "google",
        connectionId: "connection-1",
        sessionId: "session-1",
        csrfTokenHash: createHash("sha256")
          .update("csrf-token-1")
          .digest("base64url"),
        codeVerifier: "code-verifier-1",
        issuedAt: "2026-07-12T12:00:00.000Z",
        expiresAt: "2026-07-12T12:05:00.000Z",
        returnTo: "/me/calendar-connections",
        providerInternal: "must-not-be-accepted",
      },
      secret,
      Iron.defaults,
    );

    await expect(
      unsealCalendarConnectionState({ state, secret }),
    ).rejects.toThrow();
  });

  it("rejects a state at its expiry boundary", async () => {
    const secret = "0123456789abcdef0123456789abcdef";
    const state = await sealCalendarConnectionState({
      provider: "google",
      connectionId: "connection-1",
      sessionId: "session-1",
      csrfToken: "csrf-token-1",
      codeVerifier: "code-verifier-1",
      issuedAt: new Date("2026-07-12T12:00:00.000Z"),
      expiresAt: new Date("2026-07-12T12:05:00.000Z"),
      secret,
    });

    await expect(
      unsealCalendarConnectionState({
        state,
        secret,
        now: new Date("2026-07-12T12:05:00.000Z"),
      }),
    ).rejects.toThrow("Calendar OAuth state has expired");
  });
});
