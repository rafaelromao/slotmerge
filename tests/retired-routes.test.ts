import { describe, expect, it } from "vitest";

import { GET as retiredSearchGet } from "../app/api/searches/[id]/route";
import { GET as retiredSearchSnapshotGet } from "../app/search/[id]/snapshot/route";
import { GET as retiredSearchHistoryGet } from "../app/search/history/route";
import { GET as retiredAvailabilityWindowsGet } from "../app/me/availability-windows/route";
import { POST as retiredAvailabilityWindowsPost } from "../app/me/availability-windows/route";
import { PATCH as retiredAvailabilityWindowPatch } from "../app/me/availability-windows/[id]/route";
import { DELETE as retiredAvailabilityWindowDelete } from "../app/me/availability-windows/[id]/route";
import { GET as retiredAvailabilityOverridesGet } from "../app/me/availability-overrides/route";
import { POST as retiredAvailabilityOverridesPost } from "../app/me/availability-overrides/route";
import { DELETE as retiredAvailabilityOverrideDelete } from "../app/me/availability-overrides/[id]/route";

describe("Retired routes return 404 with successor Link header", () => {
  describe("GET /api/searches/[id]", () => {
    it("returns 404 with Link header pointing to v1 successor", async () => {
      const response = await retiredSearchGet(
        new Request("http://localhost/api/searches/123"),
        { params: Promise.resolve({ id: "123" }) },
      );
      expect(response.status).toBe(404);
      const link = response.headers.get("Link");
      expect(link).toBe(
        "</api/v1/searches/123>; rel=\"successor-version\"",
      );
    });
  });

  describe("GET /search/[id]/snapshot", () => {
    it("returns 404 with Link header pointing to v1 successor", async () => {
      const response = await retiredSearchSnapshotGet(
        new Request("http://localhost/search/abc/snapshot"),
        { params: Promise.resolve({ id: "abc" }) },
      );
      expect(response.status).toBe(404);
      const link = response.headers.get("Link");
      expect(link).toBe(
        "</api/v1/searches/abc>; rel=\"successor-version\"",
      );
    });
  });

  describe("GET /search/history", () => {
    it("returns 404 with Link header pointing to v1 successor", () => {
      const response = retiredSearchHistoryGet(
        new Request("http://localhost/search/history"),
      );
      expect(response.status).toBe(404);
      const link = response.headers.get("Link");
      expect(link).toBe(
        "</api/v1/searches>; rel=\"successor-version\"",
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
