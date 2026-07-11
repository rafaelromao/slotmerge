import { describe, expect, it, vi } from "vitest";

import { handleLocalSmokeJob } from "./smoke";

describe("local smoke worker task", () => {
  it("marks an enqueued smoke job as processed", async () => {
    const markProcessed = vi.fn().mockResolvedValue(undefined);

    await handleLocalSmokeJob({ marker: "smoke-marker" }, { markProcessed });

    expect(markProcessed).toHaveBeenCalledWith("smoke-marker");
  });
});
