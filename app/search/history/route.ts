import { legacyRedirect } from "../../../src/lib/legacy-redirect";

export function GET(_request: Request): Response {
  return legacyRedirect({
    target: "/api/v1/searches",
    sunset: new Date("2026-12-31T23:59:59.000Z"),
  });
}
