import { legacyRedirect } from "../../../src/lib/legacy-redirect";

export function GET(): Response {
  return legacyRedirect({
    target: "/admin#status",
    sunset: new Date("2026-12-31T23:59:59.000Z"),
  });
}
