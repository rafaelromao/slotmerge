import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

import { buildMockEmailAdapter } from "./mock-email-adapter";
import { processEmailDeliveryJob } from "../src/email/worker";
import {
  handleEmailDeliveryJob,
  setEmailTransportForTests,
} from "../src/worker/email";
import { buildTestClock } from "./test-clock";

vi.mock("../src/email/repository", () => ({
  createPostgresEmailEventRepository: vi.fn(() => ({
    createQueuedEvent: vi.fn(),
    recordAttempt: vi.fn().mockResolvedValue({
      id: "evt-seam-test",
      recipient: "user@example.com",
      type: "invite",
      payloadReference: "ref-1",
      status: "sending",
      attempts: 1,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      sentAt: null,
      failedAt: null,
      lastAttemptAt: new Date("2026-01-01T00:00:00.000Z"),
      lastErrorCode: null,
      lastErrorMessage: null,
    }),
    markDelivered: vi.fn().mockResolvedValue({
      id: "evt-seam-test",
      recipient: "user@example.com",
      type: "invite",
      payloadReference: "ref-1",
      status: "sent",
      attempts: 1,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      sentAt: new Date("2026-01-01T00:00:00.000Z"),
      failedAt: null,
      lastAttemptAt: new Date("2026-01-01T00:00:00.000Z"),
      lastErrorCode: null,
      lastErrorMessage: null,
    }),
    markFailed: vi.fn(),
  })),
}));

vi.mock("../src/admin/critical-email.repository", () => ({
  createPostgresAdminCriticalDispatchLookup: vi.fn(() => ({
    findLastDispatchAt: vi.fn().mockResolvedValue(null),
  })),
  createPostgresAdminDirectory: vi.fn(() => ({
    listAdmins: vi.fn().mockResolvedValue([]),
  })),
}));

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

  it("simulates failure before Nth attempt then success", async () => {
    const adapter = buildMockEmailAdapter();
    adapter.setSucceedsOnAttempt(3);

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
    adapter.setSucceedsOnAttempt(2);

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

describe("MockEmailAdapter wiring with processEmailDeliveryJob", () => {
  const mockEventRepository = {
    createQueuedEvent: vi.fn(),
    recordAttempt: vi.fn(),
    markDelivered: vi.fn(),
    markFailed: vi.fn(),
  };

  const mockCriticalEmail = {
    trigger: vi.fn(),
  };

  const mockClock = () => new Date("2026-01-01T00:00:00.000Z");

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records a send through processEmailDeliveryJob", async () => {
    const adapter = buildMockEmailAdapter();

    mockEventRepository.recordAttempt.mockResolvedValue({
      id: "evt-wiring-1",
      recipient: "user@example.com",
      type: "invite",
      payloadReference: "ref-1",
      status: "sending",
      attempts: 1,
      createdAt: mockClock(),
      updatedAt: mockClock(),
      sentAt: null,
      failedAt: null,
      lastAttemptAt: mockClock(),
      lastErrorCode: null,
      lastErrorMessage: null,
    });

    mockEventRepository.markDelivered.mockResolvedValue({
      id: "evt-wiring-1",
      recipient: "user@example.com",
      type: "invite",
      payloadReference: "ref-1",
      status: "sent",
      attempts: 1,
      createdAt: mockClock(),
      updatedAt: mockClock(),
      sentAt: mockClock(),
      failedAt: null,
      lastAttemptAt: mockClock(),
      lastErrorCode: null,
      lastErrorMessage: null,
    });

    await processEmailDeliveryJob(
      {
        emailEventId: "evt-wiring-1",
        recipient: "user@example.com",
        type: "invite",
        payload: { inviteId: "invite-wiring-1" },
      },
      {
        clock: mockClock,
        eventRepository: mockEventRepository,
        transport: adapter,
        criticalEmail: mockCriticalEmail,
      },
    );

    expect(adapter.sends).toHaveLength(1);
    const send = adapter.sends[0];
    expect(send.emailEventId).toBe("evt-wiring-1");
    expect(send.recipient).toBe("user@example.com");
    expect(send.type).toBe("invite");
    expect(send.payload).toEqual({ inviteId: "invite-wiring-1" });
    expect(send.status).toBe("sent");
  });

  it("records a failed send through processEmailDeliveryJob", async () => {
    const adapter = buildMockEmailAdapter();
    adapter.setPersistentFailure("provider unavailable");

    mockEventRepository.recordAttempt.mockResolvedValue({
      id: "evt-wiring-2",
      recipient: "user@example.com",
      type: "magic-link",
      payloadReference: "ref-2",
      status: "sending",
      attempts: 1,
      createdAt: mockClock(),
      updatedAt: mockClock(),
      sentAt: null,
      failedAt: null,
      lastAttemptAt: mockClock(),
      lastErrorCode: null,
      lastErrorMessage: null,
    });

    mockEventRepository.markFailed.mockResolvedValue({
      id: "evt-wiring-2",
      recipient: "user@example.com",
      type: "magic-link",
      payloadReference: "ref-2",
      status: "failed",
      attempts: 1,
      createdAt: mockClock(),
      updatedAt: mockClock(),
      sentAt: null,
      failedAt: mockClock(),
      lastAttemptAt: mockClock(),
      lastErrorCode: "provider-unavailable",
      lastErrorMessage: "provider unavailable",
    });

    await expect(
      processEmailDeliveryJob(
        {
          emailEventId: "evt-wiring-2",
          recipient: "user@example.com",
          type: "magic-link",
          payload: { token: "token-wiring-2" },
        },
        {
          clock: mockClock,
          eventRepository: mockEventRepository,
          transport: adapter,
          criticalEmail: mockCriticalEmail,
        },
      ),
    ).rejects.toThrow("provider unavailable");

    expect(adapter.sends).toHaveLength(1);
    const send = adapter.sends[0];
    expect(send.emailEventId).toBe("evt-wiring-2");
    expect(send.status).toBe("failed");
    expect(send.error).toBe("provider unavailable");
  });
});

describe("setEmailTransportForTests seam", () => {
  let adapter: ReturnType<typeof buildMockEmailAdapter>;
  let clock: ReturnType<typeof buildTestClock>;

  beforeEach(() => {
    adapter = buildMockEmailAdapter();
    setEmailTransportForTests(adapter);
    clock = buildTestClock(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    setEmailTransportForTests(null);
    vi.restoreAllMocks();
  });

  it("records a send through handleEmailDeliveryJob via the module-level seam", async () => {
    await handleEmailDeliveryJob(
      {
        emailEventId: "evt-seam-1",
        recipient: "user@example.com",
        type: "invite",
        payload: { inviteId: "invite-seam-1" },
      },
      { clock },
    );

    expect(adapter.sends).toHaveLength(1);
    const send = adapter.sends[0];
    expect(send.emailEventId).toBe("evt-seam-1");
    expect(send.recipient).toBe("user@example.com");
    expect(send.type).toBe("invite");
    expect(send.payload).toEqual({ inviteId: "invite-seam-1" });
    expect(send.status).toBe("sent");
    expect(send.providerMessageId).toBe("mock-evt-seam-1");
  });

  it("records a failed send through handleEmailDeliveryJob", async () => {
    adapter.setPersistentFailure("provider unavailable");

    await expect(
      handleEmailDeliveryJob(
        {
          emailEventId: "evt-seam-2",
          recipient: "user@example.com",
          type: "magic-link",
          payload: { token: "token-seam-2" },
        },
        { clock },
      ),
    ).rejects.toThrow("provider unavailable");

    expect(adapter.sends).toHaveLength(1);
    const send = adapter.sends[0];
    expect(send.emailEventId).toBe("evt-seam-2");
    expect(send.status).toBe("failed");
    expect(send.error).toBe("provider unavailable");
  });
});
