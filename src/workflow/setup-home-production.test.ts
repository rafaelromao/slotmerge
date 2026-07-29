import { describe, expect, it } from "vitest";

import { createProductionSetupHomeWorkflow } from "./setup-home-production";

describe("createProductionSetupHomeWorkflow", () => {
  it("constructs with a clock-backed Availability Window repository", () => {
    const clock = { now: () => new Date("2026-07-12T12:00:00.000Z") };

    expect(() => createProductionSetupHomeWorkflow(clock)).not.toThrow();
  });
});
