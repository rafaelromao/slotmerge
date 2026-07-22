import { createAdminTopicProposalsHandlers } from "../../../src/admin/topic-proposals";
import { legacyRedirect } from "../../../src/lib/legacy-redirect";
import { systemDependencies } from "../../../src/system";

const handlers = createAdminTopicProposalsHandlers(systemDependencies());

export const POST = handlers.POST;

export function GET(): Response {
  return legacyRedirect({
    target: "/admin#topics",
    sunset: new Date("2026-12-31T23:59:59.000Z"),
  });
}
