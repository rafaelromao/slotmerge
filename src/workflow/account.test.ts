import { describe, expect, it } from "vitest";

import { createAccountWorkflow, type AccountRepository } from "./account";

class InMemoryAccountRepository implements AccountRepository {
  constructor(private readonly userIds: Set<string>) {}

  async selfDelete(userId: string): Promise<boolean> {
    await Promise.resolve();
    return this.userIds.delete(userId);
  }
}

describe("accountWorkflow.selfDelete", () => {
  it("deletes an existing User and returns a typed successful Result", async () => {
    const repository = new InMemoryAccountRepository(new Set(["user-1"]));
    const workflow = createAccountWorkflow({ repository });

    const result = await workflow.selfDelete({ userId: "user-1" });

    expect(result).toEqual({ ok: true, value: undefined });
  });

  it("returns user_not_found when the User does not exist", async () => {
    const repository = new InMemoryAccountRepository(new Set());
    const workflow = createAccountWorkflow({ repository });

    const result = await workflow.selfDelete({ userId: "missing-user" });

    expect(result).toEqual({
      ok: false,
      error: { code: "user_not_found" },
    });
  });
});
