import { createAdminInvitesHandlers } from "../../../src/admin/invites";
import { systemDependencies } from "../../../src/system";

const handlers = createAdminInvitesHandlers(systemDependencies());

export const GET = handlers.GET;
export const POST = handlers.POST;
