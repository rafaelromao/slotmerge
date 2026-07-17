import { createAdminInvitesHandlers } from "../../../src/admin/invites";
import { systemClock } from "../../../src/system/clock";

const handlers = createAdminInvitesHandlers({
  clock: systemClock(),
});

export const GET = handlers.GET;
export const POST = handlers.POST;
