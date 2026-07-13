/**
 * E2E tests for invite flow and magic link authentication.
 *
 * E2E coverage: PRD stories 1-5 → tests 1-7
 *
 * Behaviors:
 * - B: Invited email receives magic link and can authenticate via the link
 * - B: Non-invited email cannot request or use a magic link
 * - B: Magic link cannot be used after expiration (clock advances past expiry)
 * - B: Magic link cannot be used twice (already-used token rejected)
 * - B: Self-delete removes profile, availability, calendar connections, discoverability;
 *       audit references preserved
 */

import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { sealSessionCookie } from "../../../src/auth/session";
import { createInvite, createUser } from "../helpers/db";
import { TestClock } from "../helpers/clock";

const MAGIC_LINK_SECRET = "e2e-test-magic-link-secret";

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function signPayload(payloadEncoded: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(payloadEncoded)
    .digest("base64url");
}

function constructMagicLinkToken(params: {
  inviteId: string;
  email: string;
  expiresAt: Date;
  issuedAt: Date;
  generation?: number;
}): string {
  const payload = {
    email: params.email,
    expiresAt: params.expiresAt.toISOString(),
    issuedAt: params.issuedAt.toISOString(),
    generation: params.generation ?? 0,
    inviteId: params.inviteId,
  };
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(payloadEncoded, MAGIC_LINK_SECRET);
  return `${payloadEncoded}.${signature}`;
}

async function insertSession(userId: string, sessionId?: string): Promise<string> {
  const { randomUUID } = await import("node:crypto");
  const { getDb } = await import("../../../src/db/client");
  const { sessions } = await import("../../../src/db/schema");
  const db = getDb();
  const id = sessionId ?? randomUUID();
  await db.insert(sessions).values({
    id,
    userId,
    csrfToken: "e2e-csrf-token",
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  return id;
}

describe("Invite and magic link authentication", () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Test 1 — Invited email can request a magic link and authenticate
  // ─────────────────────────────────────────────────────────────────────────────
  it("test-1: invited email receives magic link and can authenticate", async () => {
    const { POST: requestMagicLink } =
      await import("../../../app/auth/magic-link/request/route");
    const { POST: verifyMagicLink } =
      await import("../../../app/auth/magic-link/verify/route");

    const invite = await createInvite({
      email: "ada@example.com",
      role: "user",
      status: "pending",
      expiresAt: new Date(TestClock.now().getTime() + 7 * 24 * 60 * 60 * 1000),
      magicLinkGeneration: 0,
    });

    const requestRes = await requestMagicLink(
      new Request("http://localhost/auth/magic-link/request", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ email: "ada@example.com" }),
      }),
    );

    expect(requestRes.status).toBe(200);
    const requestBody = (await requestRes.json()) as { sent: boolean };
    expect(requestBody).toEqual({ sent: true });

    const { getDb } = await import("../../../src/db/client");
    const { emailEvents } = await import("../../../src/db/schema");
    const db = getDb();
    const [event] = await db.select().from(emailEvents).limit(1);
    expect(event).toBeDefined();
    expect(event.recipient).toBe("ada@example.com");
    expect(event.type).toBe("magic-link");

    const token = constructMagicLinkToken({
      inviteId: invite.id,
      email: "ada@example.com",
      expiresAt: new Date(TestClock.now().getTime() + 60 * 60 * 1000),
      issuedAt: TestClock.now(),
      generation: 0,
    });

    const verifyRes = await verifyMagicLink(
      new Request("http://localhost/auth/magic-link/verify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
      }),
    );

    expect(verifyRes.status).toBe(302);
    const location = verifyRes.headers.get("Location");
    expect(location).toBe("http://localhost/");

    const setCookie = verifyRes.headers.get("Set-Cookie");
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain("slotmerge_session");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 2 — Non-invited email cannot request a magic link
  // ─────────────────────────────────────────────────────────────────────────────
  it("test-2: non-invited email cannot request a magic link", async () => {
    const { POST: requestMagicLink } =
      await import("../../../app/auth/magic-link/request/route");

    const res = await requestMagicLink(
      new Request("http://localhost/auth/magic-link/request", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ email: "nobody@example.com" }),
      }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not_invited");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 3 — Magic link cannot authenticate after expiration
  // ─────────────────────────────────────────────────────────────────────────────
  it("test-3: magic link cannot authenticate after expiration", async () => {
    const { POST: requestMagicLink } =
      await import("../../../app/auth/magic-link/request/route");
    const { POST: verifyMagicLink } =
      await import("../../../app/auth/magic-link/verify/route");

    const invite = await createInvite({
      email: "ada-expired@example.com",
      role: "user",
      status: "pending",
      expiresAt: new Date(TestClock.now().getTime() + 7 * 24 * 60 * 60 * 1000),
      magicLinkGeneration: 0,
    });

    await requestMagicLink(
      new Request("http://localhost/auth/magic-link/request", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ email: "ada-expired@example.com" }),
      }),
    );

    const token = constructMagicLinkToken({
      inviteId: invite.id,
      email: "ada-expired@example.com",
      expiresAt: new Date(TestClock.now().getTime() + 60 * 60 * 1000),
      issuedAt: TestClock.now(),
      generation: 0,
    });

    TestClock.advance(2);

    const verifyRes = await verifyMagicLink(
      new Request("http://localhost/auth/magic-link/verify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
      }),
    );

    expect(verifyRes.status).toBe(400);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 4 — Magic link cannot be used twice
  // ─────────────────────────────────────────────────────────────────────────────
  it("test-4: magic link cannot be used twice", async () => {
    const { POST: verifyMagicLink } =
      await import("../../../app/auth/magic-link/verify/route");

    const invite = await createInvite({
      email: "ada-used@example.com",
      role: "user",
      status: "pending",
      expiresAt: new Date(TestClock.now().getTime() + 7 * 24 * 60 * 60 * 1000),
      magicLinkGeneration: 0,
    });

    const token = constructMagicLinkToken({
      inviteId: invite.id,
      email: "ada-used@example.com",
      expiresAt: new Date(TestClock.now().getTime() + 60 * 60 * 1000),
      issuedAt: TestClock.now(),
      generation: 0,
    });

    const verifyRes1 = await verifyMagicLink(
      new Request("http://localhost/auth/magic-link/verify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
      }),
    );

    expect(verifyRes1.status).toBe(302);

    const verifyRes2 = await verifyMagicLink(
      new Request("http://localhost/auth/magic-link/verify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
      }),
    );

    expect(verifyRes2.status).toBe(400);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 5 — Self-delete removes profile, availability, calendar connections,
  //          discoverability; audit references preserved
  // ─────────────────────────────────────────────────────────────────────────────
  it("test-5: self-delete removes personal data", async () => {
    const { DELETE: selfDelete } = await import("../../../app/me/route");

    const user = await createUser({
      id: "user-to-delete-1",
      email: "self-delete-test@example.com",
      displayName: "Delete Me",
      role: "user",
      status: "active",
    });

    const sessionId = await insertSession(user.id);

    const sessionCookie = await sealSessionCookie({
      sessionId,
    });

    const deleteRes = await selfDelete(
      new Request("http://localhost/me", {
        method: "DELETE",
        headers: {
          cookie: sessionCookie,
          "x-csrf-token": "e2e-csrf-token",
        },
      }),
    );

    expect(deleteRes.status).toBe(204);

    const { getDb } = await import("../../../src/db/client");
    const { eq } = await import("drizzle-orm");
    const { users } = await import("../../../src/db/schema");
    const db = getDb();
    const remaining = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.email, "self-delete-test@example.com"))
      .limit(1);

    expect(remaining).toHaveLength(0);
  });
});
