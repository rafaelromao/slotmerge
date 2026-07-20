import { describe, expect, it } from "vitest";

import {
  adminAccessDeniedResponse,
  escapeHtml,
  htmlResponse,
  isAdminSession,
  renderAdminShell,
} from "./page";
import type { Session } from "../auth/session";

const adminSession: Session = {
  user: {
    id: "admin-1",
    email: "admin@example.com",
    displayName: null,
    avatarUrl: null,
    shortBio: null,
    role: "admin",
    status: "active",
    profileTimezone: null,
    bufferMinutes: 0,
  },
  csrfToken: "csrf-token-1",
};

const userSession: Session = {
  user: {
    ...adminSession.user,
    id: "user-1",
    email: "user@example.com",
    role: "user",
  },
  csrfToken: "csrf-token-2",
};

describe("admin page shell", () => {
  describe("isAdminSession", () => {
    it("returns true for an admin session", () => {
      expect(isAdminSession(adminSession)).toBe(true);
    });

    it("returns false for a non-admin session", () => {
      expect(isAdminSession(userSession)).toBe(false);
    });

    it("returns false when no session is provided", () => {
      expect(isAdminSession(null)).toBe(false);
    });
  });

  describe("adminAccessDeniedResponse", () => {
    it("returns a 401 unauthorized response when no session is provided", async () => {
      const response = adminAccessDeniedResponse(null);

      expect(response.status).toBe(401);
      expect(response.headers.get("content-type")).toBe(
        "text/html; charset=utf-8",
      );
      const html = await response.text();
      expect(html).toContain("Unauthorized");
      expect(html).toContain("Sign in required.");
    });

    it("returns a 403 forbidden response for a non-admin session", async () => {
      const response = adminAccessDeniedResponse(userSession);

      expect(response.status).toBe(403);
      const html = await response.text();
      expect(html).toContain("Forbidden");
      expect(html).toContain("Admin access required.");
    });
  });

  describe("htmlResponse", () => {
    it("returns a 200 text/html response by default", async () => {
      const response = htmlResponse("<p>hello</p>");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(
        "text/html; charset=utf-8",
      );
      expect(await response.text()).toBe("<p>hello</p>");
    });

    it("honors a caller-supplied status", () => {
      const response = htmlResponse("<p>oops</p>", 418);

      expect(response.status).toBe(418);
    });
  });

  describe("escapeHtml", () => {
    it("escapes the five HTML-significant characters", () => {
      expect(escapeHtml(`<script>alert("xss")</script>'`)).toBe(
        "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;&#39;",
      );
    });

    it("leaves safe text unchanged", () => {
      expect(escapeHtml("hello world")).toBe("hello world");
    });
  });

  describe("renderAdminShell", () => {
    it("wraps the body in a document with <main> and the title heading", () => {
      const html = renderAdminShell({
        title: "Users",
        body: "<table><tbody><tr><td>ada</td></tr></tbody></table>",
      });

      expect(html).toContain("<!doctype html>");
      expect(html).toContain('<html lang="en">');
      expect(html).toContain("<main>");
      expect(html).toContain("<h1>Users</h1>");
      expect(html).toContain("<table>");
      expect(html).toContain("</main>");
    });

    it("escapes the title heading text", () => {
      const html = renderAdminShell({
        title: "Users <script>",
        body: "<p>body</p>",
      });

      expect(html).toContain("<h1>Users &lt;script&gt;</h1>");
      expect(html).not.toContain("<script>");
    });

    it("renders an alert role when one is supplied and escapes its message", () => {
      const html = renderAdminShell({
        title: "Users",
        body: "<p>body</p>",
        alert: { message: 'Invalid <role> "x"' },
      });

      expect(html).toContain(
        '<p role="alert">Invalid &lt;role&gt; &quot;x&quot;</p>',
      );
    });

    it("does not render any alert role markup when no alert is supplied", () => {
      const html = renderAdminShell({
        title: "Users",
        body: "<p>body</p>",
      });

      expect(html).not.toContain('role="alert"');
    });

    it("does not require or accept a csrf token in its shape", () => {
      const html = renderAdminShell({
        title: "Topics",
        body: '<input type="hidden" name="_csrf" value="csrf-token-1" />',
      });

      expect(html).toContain('name="_csrf"');
      expect(html).toContain("csrf-token-1");
    });
  });
});
