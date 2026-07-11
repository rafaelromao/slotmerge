import { describe, expect, it } from "vitest";

import { GET } from "../src/app/me/route";
import {
  sealSessionCookie,
  setSessionRepositoryForTests,
} from "../src/auth/session";

describe("GET /me", () => {
  it("rejects requests without a valid session", async () => {
    const response = await GET(new Request("http://localhost/me"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "unauthenticated",
    });
  });

  it("returns empty User state for an authenticated session", async () => {
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === "session-1"
            ? {
                user: {
                  id: "user-1",
                  email: "user@example.com",
                  displayName: null,
                  role: "user",
                },
              }
            : null,
        ),
    });

    const cookie = await sealSessionCookie({ sessionId: "session-1" });
    const response = await GET(
      new Request("http://localhost/me", {
        headers: { cookie },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: {
        id: "user-1",
        email: "user@example.com",
        displayName: null,
        role: "user",
      },
      setup: { complete: false },
      topics: [],
      topicProposals: [],
      availabilityWindows: [],
      calendarConnections: [],
    });
  });
});
