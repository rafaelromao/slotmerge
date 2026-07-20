import { createAdminInvitesHandlers } from "../../../src/admin/invites";

const handlers = createAdminInvitesHandlers();

export const GET = handlers.GET;
export const POST = handlers.POST;
