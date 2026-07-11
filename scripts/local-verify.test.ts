import { describe, expect, it, vi } from "vitest";

import { runLocalVerification } from "./local-verify";

describe("runLocalVerification", () => {
  it("reports a successful migration state when the database migrates cleanly", async () => {
    const result = await runLocalVerification({
      env: {
        APP_ENV: "local",
        DATABASE_URL: "postgres://slotmerge:slotmerge@localhost:5432/slotmerge",
      },
      applyMigrations: vi.fn().mockResolvedValue({ applied: true }),
      checkWebHealth: vi.fn().mockResolvedValue({ ok: true }),
      processSmokeJob: vi.fn().mockResolvedValue({ ok: true, marker: "smoke" }),
    });

    expect(result).toEqual({
      ok: true,
      checks: {
        config: "ok",
        migrations: "ok",
        web: "ok",
        worker: "ok",
      },
    });
  });

  it("fails verification when worker processing is not observed", async () => {
    await expect(
      runLocalVerification({
        env: {
          APP_ENV: "local",
          DATABASE_URL:
            "postgres://slotmerge:slotmerge@localhost:5432/slotmerge",
        },
        applyMigrations: vi.fn().mockResolvedValue({ applied: true }),
        checkWebHealth: vi.fn().mockResolvedValue({ ok: true }),
        processSmokeJob: vi
          .fn()
          .mockRejectedValue(new Error("smoke job was not processed")),
      }),
    ).rejects.toThrow(/smoke job was not processed/);
  });
});
