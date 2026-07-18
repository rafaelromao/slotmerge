import { afterEach, describe, expect, it, vi } from "vitest";

import {
  findCalendarConnectionById,
  getCalendarConnectionRepository,
  setCalendarConnectionRepositoryForTests,
} from "./repository";
import type {
  CalendarConnectionRecord,
  CalendarConnectionRepository,
} from "./connection";

const baseRecord = (
  overrides: Partial<CalendarConnectionRecord>,
): CalendarConnectionRecord => ({
  id: "connection-1",
  userId: "user-1",
  provider: "google",
  providerAccountKey: "google:connection-1",
  accountIdentifier: "google:connection-1",
  scopes: "scope",
  status: "connected",
  refreshTokenEncrypted: null,
  accessTokenEncrypted: null,
  accessTokenExpiresAt: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  contributingCalendarIds: [],
  ...overrides,
});

describe("shared CalendarConnectionRepository", () => {
  afterEach(() => {
    setCalendarConnectionRepositoryForTests(null);
  });

  it("exposes the override for getCalendarConnectionRepository", () => {
    const repository: CalendarConnectionRepository = {
      createPending: vi.fn(),
      listByUserId: vi.fn(),
      findById: vi.fn(),
      updateById: vi.fn(),
    };

    setCalendarConnectionRepositoryForTests(repository);

    expect(getCalendarConnectionRepository()).toBe(repository);
  });

  it("findCalendarConnectionById queries the shared repository exactly once", async () => {
    const findById = vi
      .fn()
      .mockResolvedValue(
        baseRecord({ id: "connection-1", provider: "google" }),
      );

    setCalendarConnectionRepositoryForTests({
      createPending: vi.fn(),
      listByUserId: vi.fn(),
      findById,
      updateById: vi.fn(),
    });

    const found = await findCalendarConnectionById("connection-1");

    expect(findById).toHaveBeenCalledTimes(1);
    expect(findById).toHaveBeenCalledWith("connection-1");
    expect(found).toMatchObject({
      id: "connection-1",
      provider: "google",
    });
  });

  it("serves both google and microsoft connections from a single override", async () => {
    const google = baseRecord({
      id: "google-connection",
      provider: "google",
      providerAccountKey: "google:google-connection",
      accountIdentifier: "google:google-connection",
    });
    const microsoft = baseRecord({
      id: "microsoft-connection",
      provider: "microsoft",
      providerAccountKey: "microsoft:microsoft-connection",
      accountIdentifier: "microsoft:microsoft-connection",
    });
    const records = new Map([
      ["google-connection", google],
      ["microsoft-connection", microsoft],
    ]);
    const findById = vi.fn((id: string) =>
      Promise.resolve(records.get(id) ?? null),
    );

    setCalendarConnectionRepositoryForTests({
      createPending: vi.fn(),
      listByUserId: vi.fn(),
      findById,
      updateById: vi.fn(),
    });

    const foundGoogle = await findCalendarConnectionById("google-connection");
    const foundMicrosoft = await findCalendarConnectionById(
      "microsoft-connection",
    );
    const missing = await findCalendarConnectionById("nonexistent");

    expect(foundGoogle).toMatchObject({
      id: "google-connection",
      provider: "google",
    });
    expect(foundMicrosoft).toMatchObject({
      id: "microsoft-connection",
      provider: "microsoft",
    });
    expect(missing).toBeNull();
    expect(findById).toHaveBeenCalledTimes(3);
  });
});
