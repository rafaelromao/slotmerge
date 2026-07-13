import { describe, expect, it } from "vitest";
import Iron from "@hapi/iron";

import { sealMicrosoftCalendarConnectionState } from "../src/calendar/microsoft-calendar-connections";

describe("sealMicrosoftCalendarConnectionState", () => {
  it("seals connectionId, csrfToken, and codeVerifier into a token retrievable by Iron", async () => {
    const sealed = await sealMicrosoftCalendarConnectionState({
      connectionId: "connection-1",
      csrfToken: "csrf-token-1",
      codeVerifier: "code-verifier-1",
      secret: "0123456789abcdef0123456789abcdef",
    });

    expect(sealed).not.toBe("");
    const unsealed = (await Iron.unseal(
      sealed,
      "0123456789abcdef0123456789abcdef",
      Iron.defaults,
    )) as { connectionId: string; csrfToken: string; codeVerifier: string };

    expect(unsealed).toEqual({
      connectionId: "connection-1",
      csrfToken: "csrf-token-1",
      codeVerifier: "code-verifier-1",
    });
  });
});
