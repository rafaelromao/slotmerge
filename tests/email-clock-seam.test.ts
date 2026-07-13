import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

import {
  handleEmailDeliveryJob,
  setClockForTests,
} from "../src/worker/email";
import type { EmailEventRepository } from "../src/email/service";
import { buildTestClock } from "./test-clock";

vi.mock("../src/email/repository", () => ({
  createPostgresEmailEventRepository: vi.fn(),
}));

vi.mock("../src/admin/critical-email.repository", () => ({
  createPostgresAdminCriticalDispatchLookup: vi.fn(() => ({
    findLastDispatchAt: vi.fn().mockResolvedValue(null),
  })),
  createPostgresAdminDirectory: vi.fn(() => ({
    findAdminByEmail: vi.fn().mockResolvedValue(null),
  })),
}));

describe("setClockForTests seam in email worker", () => {
  let clock: ReturnType<typeof buildTestClock>;
  let mockEventRepository: EmailEventRepository;

  beforeEach(async () => {
    clock = buildTestClock(new Date("2026-01-01T00:00:00.000Z"));
    setClockForTests(() => clock.now());

    mockEventRepository = {
      createQueuedEvent: vi.fn(),
      recordAttempt: vi.fn().mockResolvedValue({
        id: "evt",
        recipient: "user@example.com",
        type: "invite",
        payloadReference: "ref",
        status: "sending",
        attempts: 1,
        createdAt: clock.now(),
        updatedAt: clock.now(),
        sentAt: null,
        failedAt: null,
        lastAttemptAt: clock.now(),
        lastErrorCode: null,
        lastErrorMessage: null,
      }),
      markDelivered: vi.fn().mockResolvedValue({
        id: "evt",
        recipient: "user@example.com",
        type: "invite",
        payloadReference: "ref",
        status: "sent",
        attempts: 1,
        createdAt: clock.now(),
        updatedAt: clock.now(),
        sentAt: clock.now(),
        failedAt: null,
        lastAttemptAt: clock.now(),
        lastErrorCode: null,
        lastErrorMessage: null,
      }),
      markFailed: vi.fn(),
    };

    const { createPostgresEmailEventRepository } = await import(
      "../src/email/repository"
    );
    vi.mocked(createPostgresEmailEventRepository).mockReturnValue(
      mockEventRepository,
    );
  });

  afterEach(() => {
    setClockForTests(null);
    vi.restoreAllMocks();
  });

  it("clock from setClockForTests flows into recordAttempt", async () => {
    await handleEmailDeliveryJob({
      emailEventId: "evt-clock-1",
      recipient: "user@example.com",
      type: "invite",
      payload: { inviteId: "invite-1" },
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockEventRepository.recordAttempt).toHaveBeenCalledWith(
      "evt-clock-1",
      expect.any(Date),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const [, attemptedAt] = vi.mocked(mockEventRepository.recordAttempt).mock.calls[0];
    expect(attemptedAt).toEqual(new Date("2026-01-01T00:00:00.000Z"));
  });

  it("clock from setClockForTests flows into markDelivered", async () => {
    await handleEmailDeliveryJob({
      emailEventId: "evt-clock-2",
      recipient: "user@example.com",
      type: "invite",
      payload: { inviteId: "invite-2" },
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockEventRepository.markDelivered).toHaveBeenCalledWith(
      "evt-clock-2",
      expect.any(Date),
      expect.anything(),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const [, deliveredAt] = vi.mocked(mockEventRepository.markDelivered).mock.calls[0] as [
      string,
      Date,
    ];
    expect(deliveredAt).toEqual(new Date("2026-01-01T00:00:00.000Z"));
  });

  it("advanced clock is reflected in recordAttempt timestamps", async () => {
    clock.advance(3600 * 1000);

    await handleEmailDeliveryJob({
      emailEventId: "evt-clock-3",
      recipient: "user@example.com",
      type: "magic-link",
      payload: { token: "token-3" },
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const [, attemptedAt] = vi.mocked(mockEventRepository.recordAttempt).mock.calls[0];
    expect(attemptedAt).toEqual(new Date("2026-01-01T01:00:00.000Z"));
  });
});
