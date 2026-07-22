import { legacyRedirect } from "../../../src/lib/legacy-redirect";

export function GET(_request: Request): Response {
  return legacyRedirect({
    target: "/admin#topics",
    sunset: new Date("2026-12-31T23:59:59.000Z"),
  });
}

export const POST = GET;
