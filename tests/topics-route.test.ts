import { describe, expect, it } from "vitest";

import { GET } from "../app/topics/route";
import {
  sealSessionCookie,
  setSessionRepositoryForTests,
} from "../src/auth/session";
import { setTopicCatalogueRepositoryForTests } from "../src/topics/repository";

describe("GET /topics", () => {
  it("returns the active catalogue for authenticated users", async () => {
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === "session-1"
            ? {
                user: {
                  id: "user-1",
                  email: "user@example.com",
                  displayName: null,
                  avatarUrl: null,
                  shortBio: null,
                  role: "user",
                  status: "active",
                  profileTimezone: null,
                  bufferMinutes: 0,
                },
                csrfToken: "csrf-token-1",
              }
            : null,
        ),
    });

    setTopicCatalogueRepositoryForTests({
      listCatalogue: () =>
        Promise.resolve([
          { id: "topic-1", name: "Product strategy", status: "active" },
          { id: "topic-2", name: "AI engineering", status: "active" },
          { id: "topic-3", name: "Design systems", status: "retired" },
        ]),
      listSelectedTopicIds: () => Promise.resolve([]),
      listAssociations: () => Promise.resolve([]),
      saveAssociations: () => Promise.resolve(),
    });

    const cookie = await sealSessionCookie({ sessionId: "session-1" });
    const response = await GET(
      new Request("http://localhost/topics", {
        headers: { cookie },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      topics: [
        { id: "topic-1", name: "Product strategy" },
        { id: "topic-2", name: "AI engineering" },
      ],
    });

    setSessionRepositoryForTests(null);
    setTopicCatalogueRepositoryForTests(null);
  });
});
