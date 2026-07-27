import { legacyRedirect } from "../../../src/lib/legacy-redirect";

export function GET(): Response {
  return legacyRedirect({
    target: "/admin#users",
    sunset: new Date("2026-12-31T23:59:59.000Z"),
  });
}

export function POST(): Response {
  return legacyRedirect({
    target: "/admin#users",
    sunset: new Date("2026-12-31T23:59:59.000Z"),
  });
}

// Re-export for downstream callers that previously imported a `GET(request)`
// style handler; both signatures now point at the legacy redirect. The
// legacy handler is retained only so existing e2e test imports keep
// compiling after the redirect migration.
export const legacyGet = GET;
