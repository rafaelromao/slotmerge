import { describe, expect, it, vi } from "vitest";

import { createEnqueueSmokeResponse } from "./enqueue-smoke";

describe("local smoke enqueue endpoint", () => {
  it("stores and enqueues a local smoke job in local mode", async () => {
    const storeSmokeJob = vi.fn().mockResolvedValue(undefined);
    const enqueueSmokeJob = vi.fn().mockResolvedValue(undefined);
    const request = new Request("http://localhost/api/local/enqueue-smoke", {
      method: "POST",
      body: JSON.stringify({ marker: "smoke-marker" }),
    });

    const response = await createEnqueueSmokeResponse(request, {
      env: {
        APP_ENV: "local",
        DATABASE_URL: "postgres://slotmerge:slotmerge@localhost:5432/slotmerge",
      },
      storeSmokeJob,
      enqueueSmokeJob,
    });

    expect(response.status).toBe(202);
    expect(storeSmokeJob).toHaveBeenCalledWith("smoke-marker");
    expect(enqueueSmokeJob).toHaveBeenCalledWith("smoke-marker");
  });
});
