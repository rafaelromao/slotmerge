import { describe, expect, it } from "vitest";

import { buildMockEmailAdapter } from "./mock-email-adapter";

describe("MockEmailAdapter", () => {
  it("records a send call with recipient, type, and payload", async () => {
    const adapter = buildMockEmailAdapter();

    await adapter.send({
      emailEventId: "evt-1",
      recipient: "user@example.com",
      type: "invite",
      payload: { inviteId: "invite-1" },
    });

    expect(adapter.sends).toHaveLength(1);
    const send = adapter.sends[0];
    expect(send.recipient).toBe("user@example.com");
    expect(send.type).toBe("invite");
    expect(send.payload).toEqual({ inviteId: "invite-1" });
    expect(send.status).toBe("sent");
    expect(send.providerMessageId).toBe(`mock-evt-1`);
  });

  it("resets recorded sends", async () => {
    const adapter = buildMockEmailAdapter();

    await adapter.send({
      emailEventId: "evt-1",
      recipient: "user@example.com",
      type: "invite",
      payload: { inviteId: "invite-1" },
    });

    adapter.reset();

    expect(adapter.sends).toHaveLength(0);
  });

  it("simulates a persistent failure - all sends throw", async () => {
    const adapter = buildMockEmailAdapter();
    adapter.setPersistentFailure("provider unavailable");

    await expect(
      adapter.send({
        emailEventId: "evt-1",
        recipient: "user@example.com",
        type: "invite",
        payload: { inviteId: "invite-1" },
      }),
    ).rejects.toThrow("provider unavailable");

    expect(adapter.sends).toHaveLength(1);
    const send = adapter.sends[0];
    expect(send.status).toBe("failed");
    expect(send.error).toBe("provider unavailable");
  });

  it("simulates a single next-send failure", async () => {
    const adapter = buildMockEmailAdapter();
    adapter.setNextSendFailure("temporary error");

    await expect(
      adapter.send({
        emailEventId: "evt-1",
        recipient: "user@example.com",
        type: "invite",
        payload: { inviteId: "invite-1" },
      }),
    ).rejects.toThrow("temporary error");

    await adapter.send({
      emailEventId: "evt-2",
      recipient: "user@example.com",
      type: "invite",
      payload: { inviteId: "invite-2" },
    });

    expect(adapter.sends).toHaveLength(2);
    expect(adapter.sends[0].status).toBe("failed");
    expect(adapter.sends[1].status).toBe("sent");
  });

  it("simulates failure after N attempts then success", async () => {
    const adapter = buildMockEmailAdapter();
    adapter.setFailsAfterAttempts(3);

    await expect(
      adapter.send({
        emailEventId: "evt-1",
        recipient: "user@example.com",
        type: "invite",
        payload: { inviteId: "invite-1" },
      }),
    ).rejects.toThrow();

    await expect(
      adapter.send({
        emailEventId: "evt-1",
        recipient: "user@example.com",
        type: "invite",
        payload: { inviteId: "invite-1" },
      }),
    ).rejects.toThrow();

    const result = await adapter.send({
      emailEventId: "evt-1",
      recipient: "user@example.com",
      type: "invite",
      payload: { inviteId: "invite-1" },
    });

    expect(result.providerMessageId).toBe("mock-evt-1");
    expect(adapter.sends).toHaveLength(3);
    expect(adapter.sends[0].status).toBe("failed");
    expect(adapter.sends[1].status).toBe("failed");
    expect(adapter.sends[2].status).toBe("sent");
  });

  it("tracks attempts per emailEventId for retry simulation", async () => {
    const adapter = buildMockEmailAdapter();
    adapter.setFailsAfterAttempts(2);

    await expect(
      adapter.send({
        emailEventId: "evt-1",
        recipient: "user@example.com",
        type: "invite",
        payload: { inviteId: "invite-1" },
      }),
    ).rejects.toThrow();

    await expect(
      adapter.send({
        emailEventId: "evt-2",
        recipient: "user@example.com",
        type: "magic-link",
        payload: { token: "token-1" },
      }),
    ).rejects.toThrow();

    const result1 = await adapter.send({
      emailEventId: "evt-1",
      recipient: "user@example.com",
      type: "invite",
      payload: { inviteId: "invite-1" },
    });

    const result2 = await adapter.send({
      emailEventId: "evt-2",
      recipient: "user@example.com",
      type: "magic-link",
      payload: { token: "token-1" },
    });

    expect(result1.providerMessageId).toBe("mock-evt-1");
    expect(result2.providerMessageId).toBe("mock-evt-2");
    expect(adapter.sends).toHaveLength(4);
    expect(adapter.sends.filter((s) => s.status === "failed")).toHaveLength(2);
    expect(adapter.sends.filter((s) => s.status === "sent")).toHaveLength(2);
  });

  it("filters sends by recipient", async () => {
    const adapter = buildMockEmailAdapter();

    await adapter.send({
      emailEventId: "evt-1",
      recipient: "alice@example.com",
      type: "invite",
      payload: {},
    });
    await adapter.send({
      emailEventId: "evt-2",
      recipient: "bob@example.com",
      type: "invite",
      payload: {},
    });
    await adapter.send({
      emailEventId: "evt-3",
      recipient: "alice@example.com",
      type: "magic-link",
      payload: {},
    });

    const aliceSends = adapter.getSendsByRecipient("alice@example.com");
    expect(aliceSends).toHaveLength(2);
    expect(aliceSends.every((s) => s.recipient === "alice@example.com")).toBe(
      true,
    );
  });

  it("filters sends by type", async () => {
    const adapter = buildMockEmailAdapter();

    await adapter.send({
      emailEventId: "evt-1",
      recipient: "user@example.com",
      type: "invite",
      payload: {},
    });
    await adapter.send({
      emailEventId: "evt-2",
      recipient: "user@example.com",
      type: "magic-link",
      payload: {},
    });
    await adapter.send({
      emailEventId: "evt-3",
      recipient: "user@example.com",
      type: "invite",
      payload: {},
    });

    const inviteSends = adapter.getSendsByType("invite");
    expect(inviteSends).toHaveLength(2);
    expect(inviteSends.every((s) => s.type === "invite")).toBe(true);
  });
});
