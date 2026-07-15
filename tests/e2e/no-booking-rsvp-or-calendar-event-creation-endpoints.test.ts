import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const REPO_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const APP_ROOT = join(REPO_ROOT, "app");

const ROUTE_PATH_BOOKING = /\bbooking\b/i;
const ROUTE_PATH_RSVP = /\brsvp\b/i;
const ROUTE_PATH_INVITATION = /\binvitation\b/i;
const ROUTE_PATH_CALENDAR_EVENT_WRITE =
  /\bcalendar\b.*\b(?:create|new|add|write|event)\b|\b(?:create|new|add|write|event)\b.*\bcalendar\b|\bcalendar[/\\]events[/\\]/i;

const UI_BOOKING_AFFORDANCE =
  /\b(?:book|booking|reserve|reservation)\b.*\b(?:button|form|link|action|submit)\b|\b(?:button|form|link|action|submit)\b.*\b(?:book|booking|reserve|reservation)\b/i;
const UI_RSVP_INVITATION_AFFORDANCE =
  /\b(?:rsvp|invitation|invite)\b.*\b(?:button|form|link|action|respond|accept|decline)\b|\b(?:button|form|link|action|respond|accept|decline)\b.*\b(?:rsvp|invitation|invite)\b/i;
const UI_CALENDAR_EVENT_AFFORDANCE =
  /\b(?:create|add|new|write)\b.*\b(?:calendar.?event|event.?calendar|event)\b|\b(?:calendar.?event|event.?calendar|event)\b.*\b(?:create|add|new|write)\b/i;

async function listAppSourceFiles(root = APP_ROOT): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const filePath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listAppSourceFiles(filePath)));
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(filePath);
    }
  }

  return files;
}

describe("E2E: no booking, RSVP, or calendar event creation endpoints exist", () => {
  describe("Route existence checks", () => {
    it("no booking routes exist", async () => {
      const sourceFiles = await listAppSourceFiles();
      const routeFiles = sourceFiles.filter((filePath) =>
        filePath.endsWith("route.ts"),
      );

      expect(routeFiles.length).toBeGreaterThan(0);

      const bookingRoutes = routeFiles.filter((filePath) =>
        ROUTE_PATH_BOOKING.test(relative(APP_ROOT, filePath)),
      );

      expect(bookingRoutes).toHaveLength(0);
    });

    it("no RSVP routes exist", async () => {
      const sourceFiles = await listAppSourceFiles();
      const routeFiles = sourceFiles.filter((filePath) =>
        filePath.endsWith("route.ts"),
      );

      const rsvpRoutes = routeFiles.filter((filePath) =>
        ROUTE_PATH_RSVP.test(relative(APP_ROOT, filePath)),
      );

      expect(rsvpRoutes).toHaveLength(0);
    });

    it("no invitation routes exist", async () => {
      const sourceFiles = await listAppSourceFiles();
      const routeFiles = sourceFiles.filter((filePath) =>
        filePath.endsWith("route.ts"),
      );

      const invitationRoutes = routeFiles.filter((filePath) =>
        ROUTE_PATH_INVITATION.test(relative(APP_ROOT, filePath)),
      );

      expect(invitationRoutes).toHaveLength(0);
    });

    it("no calendar-event write routes exist", async () => {
      const sourceFiles = await listAppSourceFiles();
      const routeFiles = sourceFiles.filter((filePath) =>
        filePath.endsWith("route.ts"),
      );

      const calendarWriteRoutes = routeFiles.filter((filePath) =>
        ROUTE_PATH_CALENDAR_EVENT_WRITE.test(relative(APP_ROOT, filePath)),
      );

      expect(calendarWriteRoutes).toHaveLength(0);
    });
  });

  describe("UI affordance checks", () => {
    it("no booking UI affordances in source", async () => {
      const sourceFiles = await listAppSourceFiles();
      const tsxFiles = sourceFiles.filter((filePath) =>
        filePath.endsWith(".tsx"),
      );

      expect(tsxFiles.length).toBeGreaterThan(0);

      for (const filePath of tsxFiles) {
        const source = await readFile(filePath, "utf8");
        expect(source).not.toMatch(UI_BOOKING_AFFORDANCE);
      }
    });

    it("no RSVP/invitation UI affordances in source", async () => {
      const sourceFiles = await listAppSourceFiles();
      const tsxFiles = sourceFiles.filter((filePath) =>
        filePath.endsWith(".tsx"),
      );

      for (const filePath of tsxFiles) {
        const source = await readFile(filePath, "utf8");
        expect(source).not.toMatch(UI_RSVP_INVITATION_AFFORDANCE);
      }
    });

    it("no calendar-event creation UI affordances in source", async () => {
      const sourceFiles = await listAppSourceFiles();
      const tsxFiles = sourceFiles.filter((filePath) =>
        filePath.endsWith(".tsx"),
      );

      for (const filePath of tsxFiles) {
        const source = await readFile(filePath, "utf8");
        expect(source).not.toMatch(UI_CALENDAR_EVENT_AFFORDANCE);
      }
    });
  });
});
