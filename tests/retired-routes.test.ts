import { describe, expect, it } from "vitest";

import { GET as retiredSearchGet } from "../app/api/searches/[id]/route";
import { GET as retiredSearchResultsGet } from "../app/searches/[id]/results/route";
import { GET as retiredAdminInvitesGet } from "../app/admin/invites/route";
import { POST as retiredAdminInvitesPost } from "../app/admin/invites/route";
import { GET as retiredAdminTopicProposalsGet } from "../app/admin/topic-proposals/route";
import { POST as retiredAdminTopicProposalsPost } from "../app/admin/topic-proposals/route";
import { GET as retiredSearchSnapshotGet } from "../app/search/[id]/snapshot/route";
import { GET as retiredSearchHistoryGet } from "../app/search/history/route";
import { GET as retiredAvailabilityWindowsGet } from "../app/me/availability-windows/route";
import { POST as retiredAvailabilityWindowsPost } from "../app/me/availability-windows/route";
import { PATCH as retiredAvailabilityWindowPatch } from "../app/me/availability-windows/[id]/route";
import { DELETE as retiredAvailabilityWindowDelete } from "../app/me/availability-windows/[id]/route";
import { GET as retiredAvailabilityOverridesGet } from "../app/me/availability-overrides/route";
import { POST as retiredAvailabilityOverridesPost } from "../app/me/availability-overrides/route";
import { DELETE as retiredAvailabilityOverrideDelete } from "../app/me/availability-overrides/[id]/route";

describe("Retired routes return 308 with Deprecation, Sunset, and successor Link headers", () => {
  describe("GET /api/searches/[id]", () => {
    it("returns 308 with Deprecation, Sunset, and Link headers pointing to v1 successor", async () => {
      const response = await retiredSearchGet(
        new Request("http://localhost/api/searches/123"),
        { params: Promise.resolve({ id: "123" }) },
      );
      expect(response.status).toBe(308);
      expect(response.headers.get("Location")).toBe("/api/v1/searches/123");
      expect(response.headers.get("Deprecation")).toBe("true");
      expect(response.headers.get("Sunset")).toBe(
        "Thu, 31 Dec 2026 23:59:59 GMT",
      );
      expect(response.headers.get("Link")).toBe(
        "</api/v1/searches/123>; rel=\"successor-version\"",
      );
    });
  });

  describe("GET /search/[id]/snapshot", () => {
    it("returns 308 with Deprecation, Sunset, and Link headers pointing to v1 successor", async () => {
      const response = await retiredSearchSnapshotGet(
        new Request("http://localhost/search/abc/snapshot"),
        { params: Promise.resolve({ id: "abc" }) },
      );
      expect(response.status).toBe(308);
      expect(response.headers.get("Location")).toBe("/api/v1/searches/abc");
      expect(response.headers.get("Deprecation")).toBe("true");
      expect(response.headers.get("Sunset")).toBe(
        "Thu, 31 Dec 2026 23:59:59 GMT",
      );
      expect(response.headers.get("Link")).toBe(
        "</api/v1/searches/abc>; rel=\"successor-version\"",
      );
    });
  });

  describe("GET /search/history", () => {
    it("returns 308 with Deprecation, Sunset, and Link headers pointing to v1 successor", () => {
      const response = retiredSearchHistoryGet(
        new Request("http://localhost/search/history"),
      );
      expect(response.status).toBe(308);
      expect(response.headers.get("Location")).toBe("/api/v1/searches");
      expect(response.headers.get("Deprecation")).toBe("true");
      expect(response.headers.get("Sunset")).toBe(
        "Thu, 31 Dec 2026 23:59:59 GMT",
      );
      expect(response.headers.get("Link")).toBe(
        "</api/v1/searches>; rel=\"successor-version\"",
      );
    });
  });

  describe("GET /searches/[id]/results", () => {
    it("returns 308 with Deprecation, Sunset, and Link headers pointing to canonical /searches/[id]", async () => {
      const response = await retiredSearchResultsGet(
        new Request("http://localhost/searches/123/results"),
        { params: Promise.resolve({ id: "123" }) },
      );
      expect(response.status).toBe(308);
      expect(response.headers.get("Location")).toBe("/searches/123");
      expect(response.headers.get("Deprecation")).toBe("true");
      expect(response.headers.get("Sunset")).toBe(
        "Thu, 31 Dec 2026 23:59:59 GMT",
      );
      expect(response.headers.get("Link")).toBe(
        "</searches/123>; rel=\"successor-version\"",
      );
    });
  });

  describe("GET /admin/invites", () => {
    it("returns 308 with Deprecation, Sunset, and Link headers pointing to /admin#users", () => {
      const response = retiredAdminInvitesGet(
        new Request("http://localhost/admin/invites"),
      );
      expect(response.status).toBe(308);
      expect(response.headers.get("Location")).toBe("/admin#users");
      expect(response.headers.get("Deprecation")).toBe("true");
      expect(response.headers.get("Sunset")).toBe(
        "Thu, 31 Dec 2026 23:59:59 GMT",
      );
      expect(response.headers.get("Link")).toBe(
        "</admin#users>; rel=\"successor-version\"",
      );
    });
  });

  describe("POST /admin/invites", () => {
    it("returns 308 with Deprecation, Sunset, and Link headers pointing to /admin#users", () => {
      const response = retiredAdminInvitesPost(
        new Request("http://localhost/admin/invites", { method: "POST" }),
      );
      expect(response.status).toBe(308);
      expect(response.headers.get("Location")).toBe("/admin#users");
      expect(response.headers.get("Deprecation")).toBe("true");
      expect(response.headers.get("Sunset")).toBe(
        "Thu, 31 Dec 2026 23:59:59 GMT",
      );
      expect(response.headers.get("Link")).toBe(
        "</admin#users>; rel=\"successor-version\"",
      );
    });
  });

  describe("GET /admin/topic-proposals", () => {
    it("returns 308 with Deprecation, Sunset, and Link headers pointing to /admin#topics", () => {
      const response = retiredAdminTopicProposalsGet(
        new Request("http://localhost/admin/topic-proposals"),
      );
      expect(response.status).toBe(308);
      expect(response.headers.get("Location")).toBe("/admin#topics");
      expect(response.headers.get("Deprecation")).toBe("true");
      expect(response.headers.get("Sunset")).toBe(
        "Thu, 31 Dec 2026 23:59:59 GMT",
      );
      expect(response.headers.get("Link")).toBe(
        "</admin#topics>; rel=\"successor-version\"",
      );
    });
  });

  describe("POST /admin/topic-proposals", () => {
    it("returns 308 with Deprecation, Sunset, and Link headers pointing to /admin#topics", () => {
      const response = retiredAdminTopicProposalsPost(
        new Request("http://localhost/admin/topic-proposals", {
          method: "POST",
        }),
      );
      expect(response.status).toBe(308);
      expect(response.headers.get("Location")).toBe("/admin#topics");
      expect(response.headers.get("Deprecation")).toBe("true");
      expect(response.headers.get("Sunset")).toBe(
        "Thu, 31 Dec 2026 23:59:59 GMT",
      );
      expect(response.headers.get("Link")).toBe(
        "</admin#topics>; rel=\"successor-version\"",
      );
    });
  });

  describe("GET /me/availability-windows", () => {
    it("returns 404 with Link header pointing to successor", () => {
      const response = retiredAvailabilityWindowsGet(
        new Request("http://localhost/me/availability-windows"),
      );
      expect(response.status).toBe(404);
      const link = response.headers.get("Link");
      expect(link).toBe("</me/availability>; rel=\"successor-version\"");
    });
  });

  describe("POST /me/availability-windows", () => {
    it("returns 404 with Link header pointing to successor", () => {
      const response = retiredAvailabilityWindowsPost(
        new Request("http://localhost/me/availability-windows", {
          method: "POST",
        }),
      );
      expect(response.status).toBe(404);
      const link = response.headers.get("Link");
      expect(link).toBe("</me/availability>; rel=\"successor-version\"");
    });
  });

  describe("PATCH /me/availability-windows/[id]", () => {
    it("returns 404 with Link header pointing to successor", async () => {
      const response = await retiredAvailabilityWindowPatch(
        new Request("http://localhost/me/availability-windows/win-123", {
          method: "PATCH",
        }),
        { params: Promise.resolve({ id: "win-123" }) },
      );
      expect(response.status).toBe(404);
      const link = response.headers.get("Link");
      expect(link).toBe("</me/availability>; rel=\"successor-version\"");
    });
  });

  describe("DELETE /me/availability-windows/[id]", () => {
    it("returns 404 with Link header pointing to successor", async () => {
      const response = await retiredAvailabilityWindowDelete(
        new Request("http://localhost/me/availability-windows/win-123", {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: "win-123" }) },
      );
      expect(response.status).toBe(404);
      const link = response.headers.get("Link");
      expect(link).toBe("</me/availability>; rel=\"successor-version\"");
    });
  });

  describe("GET /me/availability-overrides", () => {
    it("returns 404 with Link header pointing to successor", () => {
      const response = retiredAvailabilityOverridesGet(
        new Request("http://localhost/me/availability-overrides"),
      );
      expect(response.status).toBe(404);
      const link = response.headers.get("Link");
      expect(link).toBe("</me/availability>; rel=\"successor-version\"");
    });
  });

  describe("POST /me/availability-overrides", () => {
    it("returns 404 with Link header pointing to successor", () => {
      const response = retiredAvailabilityOverridesPost(
        new Request("http://localhost/me/availability-overrides", {
          method: "POST",
        }),
      );
      expect(response.status).toBe(404);
      const link = response.headers.get("Link");
      expect(link).toBe("</me/availability>; rel=\"successor-version\"");
    });
  });

  describe("DELETE /me/availability-overrides/[id]", () => {
    it("returns 404 with Link header pointing to successor", async () => {
      const response = await retiredAvailabilityOverrideDelete(
        new Request("http://localhost/me/availability-overrides/ovr-456", {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: "ovr-456" }) },
      );
      expect(response.status).toBe(404);
      const link = response.headers.get("Link");
      expect(link).toBe("</me/availability>; rel=\"successor-version\"");
    });
  });
});
