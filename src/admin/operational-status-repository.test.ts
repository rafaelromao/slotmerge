import { describe, expect, it } from "vitest";

import { createPostgresOperationalStatusRepository } from "./operational-status-repository";

describe("createPostgresOperationalStatusRepository", () => {
  it("is a factory function the handler can default-bind to", () => {
    expect(typeof createPostgresOperationalStatusRepository).toBe("function");
  });
});
