import { createAdminInvitesHandlers } from "../../../src/admin/invites";
import { legacyRedirect } from "../../../src/lib/legacy-redirect";
import { systemDependencies } from "../../../src/system";

const handlers = createAdminInvitesHandlers(systemDependencies());

export const POST = handlers.POST;

export function GET(): Response {
  return legacyRedirect({
    target: "/admin#users",
    sunset: new Date("2026-12-31T23:59:59.000Z"),
  });
}
