import { afterEach, describe, expect, it } from "vitest";

import {
  getMicrosoftCalendarConnectionRepository,
  setMicrosoftCalendarConnectionRepositoryForTests,
} from "../src/calendar/repository";

describe("Microsoft calendar connection repository", () => {
  afterEach(() => {
    setMicrosoftCalendarConnectionRepositoryForTests(null);
  });

  it("returns the in-memory test override when set for tests", async () => {
    const calls: string[] = [];

    setMicrosoftCalendarConnectionRepositoryForTests({
      createPending: (record) => {
        calls.push(`create:${record.id}`);
        return Promise.resolve(record);
      },
      listByUserId: (userId) => {
        calls.push(`list:${userId}`);
        return Promise.resolve([]);
      },
      findById: (id) => {
        calls.push(`find:${id}`);
        return Promise.resolve(null);
      },
      updateById: (id, patch) => {
        calls.push(`update:${id}:${patch.status ?? ""}`);
        return Promise.resolve(null);
      },
    });

    const repository = getMicrosoftCalendarConnectionRepository();

    await repository.createPending({
      id: "connection-1",
      userId: "user-1",
      provider: "microsoft",
      providerAccountKey: null,
      accountIdentifier: null,
      scopes: null,
      status: "pending",
      refreshTokenEncrypted: null,
      accessTokenEncrypted: null,
      accessTokenExpiresAt: null,
    });
    await repository.listByUserId("user-1");
    await repository.findById("connection-1");
    await repository.updateById("connection-1", { status: "disconnected" });

    expect(calls).toEqual([
      "create:connection-1",
      "list:user-1",
      "find:connection-1",
      "update:connection-1:disconnected",
    ]);
  });
});
