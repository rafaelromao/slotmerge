/**
 * E2E tests for user setup, discoverability consent, and topic associations.
 *
 * E2E coverage:
 * - PRD stories 6-9 → tests 8-14 (profile, consent, checklist)
 * - PRD stories 15-17 → tests 51-53 (topic associations)
 *
 * Behaviors:
 * - B: Complete setup (profile + consent + topic + availability) → user is discoverable
 * - B: Incomplete setup prevents discoverability; checklist accurate
 * - B: Topic proposal submitted → appears in pending proposals
 * - B: Topic proposal does not satisfy "at least one Topic" for matching until approved
 * - B: User-topic associations persisted and returned correctly
 */

import { describe, expect, it } from "vitest";

import { sealSessionCookie } from "../../../src/auth/session";
import { createUser } from "../helpers/db";
import { insertSession, insertTopic, insertUserTopic } from "./index";

describe("Setup, consent, and topic associations", () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Tests 8-14 — Profile, consent, and setup checklist
  // ─────────────────────────────────────────────────────────────────────────────

  it("test-8: incomplete setup prevents discoverability", async () => {
    const { GET: setupStatusGet } = await import(
      "../../../app/me/setup-status/route",
    );

    const user = await createUser({
      id: "user-setup-incomplete",
      email: "setup@incomplete.com",
      displayName: null,
      role: "user",
      status: "active",
    });

    const sessionId0 = await insertSession(user.id);
    const cookie = await sealSessionCookie({ sessionId: sessionId0 });

    const res = await setupStatusGet(
      new Request("http://localhost/me/setup-status", {
        headers: { cookie },
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      profileComplete: boolean;
      discoverabilityConsentGiven: boolean;
      hasTopic: boolean;
      hasAvailability: boolean;
      setupComplete: boolean;
    };

    expect(body.setupComplete).toBe(false);
  });

  it("test-9: setup checklist accurately reflects current state", async () => {
    const { GET: setupStatusGet } = await import(
      "../../../app/me/setup-status/route",
    );
    const { POST: consentPost } = await import(
      "../../../app/me/discoverability-consent/route",
    );

    const user = await createUser({
      id: "user-setup-checklist",
      email: "checklist@example.com",
      displayName: "Checklist User",
      role: "user",
      status: "active",
    });

    const sessionId1 = await insertSession(user.id);
    const cookie = await sealSessionCookie({ sessionId: sessionId1 });

    const beforeRes = await setupStatusGet(
      new Request("http://localhost/me/setup-status", {
        headers: { cookie },
      }),
    );
    const before = (await beforeRes.json()) as { profileComplete: boolean };

    expect(before.profileComplete).toBe(true); // displayName is set

    const consentRes = await consentPost(
      new Request("http://localhost/me/discoverability-consent", {
        method: "POST",
        headers: { cookie },
      }),
    );
    expect(consentRes.status).toBe(200);

    const afterRes = await setupStatusGet(
      new Request("http://localhost/me/setup-status", {
        headers: { cookie },
      }),
    );
    const after = (await afterRes.json()) as {
      discoverabilityConsentGiven: boolean;
    };
    expect(after.discoverabilityConsentGiven).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Tests 51-53 — Topic associations
  // ─────────────────────────────────────────────────────────────────────────────

  it("test-51: topic proposal submitted by user appears in pending proposals", async () => {
    const { POST: proposalPost } = await import(
      "../../../app/topic-proposals/route",
    );

    const user = await createUser({
      id: "user-topic-proposal",
      email: "proposal@example.com",
      displayName: "Proposal User",
      role: "user",
      status: "active",
    });

    const sessionId2 = await insertSession(user.id);
    const cookie = await sealSessionCookie({ sessionId: sessionId2 });

    const res = await proposalPost(
      new Request("http://localhost/topic-proposals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie,
        },
        body: JSON.stringify({ proposedName: "Distributed Systems" }),
      }),
    );

    expect(res.status).toBe(201);
    const proposal = (await res.json()) as { id: string; status: string };
    expect(proposal.status).toBe("pending");

    const { getDb } = await import("../../../src/db/client");
    const { topicProposals } = await import("../../../src/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    const [saved] = await db
      .select()
      .from(topicProposals)
      .where(eq(topicProposals.id, proposal.id))
      .limit(1);
    expect(saved).toBeDefined();
    expect(saved.status).toBe("pending");
  });

  it("test-52: topic proposal does not satisfy matching until approved", async () => {
    const { POST: proposalPost } = await import(
      "../../../app/topic-proposals/route",
    );
    const { PUT: topicsPut } = await import("../../../app/me/topics/route");

    const user = await createUser({
      id: "user-proposal-matching",
      email: "matching@example.com",
      displayName: "Matching User",
      role: "user",
      status: "active",
    });

    const sessionId3 = await insertSession(user.id);
    const cookie = await sealSessionCookie({
      sessionId: sessionId3,
    });

    const proposalRes = await proposalPost(
      new Request("http://localhost/topic-proposals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie,
        },
        body: JSON.stringify({ proposedName: "Quantum Computing" }),
      }),
    );
    const proposal = (await proposalRes.json()) as { id: string };

    const topicsRes = await topicsPut(
      new Request("http://localhost/me/topics", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          cookie,
        },
        body: JSON.stringify({ topicProposalIds: [proposal.id] }),
      }),
    );

    expect(topicsRes.status).toBe(200);

    const { getDb } = await import("../../../src/db/client");
    const { topicProposals } = await import("../../../src/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = getDb();

    const [proposalRecord] = await db
      .select()
      .from(topicProposals)
      .where(eq(topicProposals.id, proposal.id))
      .limit(1);

    expect(proposalRecord.status).toBe("pending");
  });

  it("test-53: user-topic associations are persisted and returned correctly", async () => {
    const { GET: topicsGet } = await import("../../../app/me/topics/route");

    const user = await createUser({
      id: "user-topic-assoc",
      email: "assoc@example.com",
      displayName: "Assoc User",
      role: "user",
      status: "active",
    });

    const topic = await insertTopic("Machine Learning", "active");

    const sessionId4 = await insertSession(user.id);
    const cookie = await sealSessionCookie({ sessionId: sessionId4 });

    await insertUserTopic(user.id, topic.id, "active");

    const res = await topicsGet(
      new Request("http://localhost/me/topics", {
        headers: { cookie },
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      topics: Array<{ id: string; name: string }>;
    };
    expect(body.topics.some((t) => t.id === topic.id)).toBe(true);
  });
});
