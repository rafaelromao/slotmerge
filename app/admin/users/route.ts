import { createAdminUsersHandlers } from "../../../src/admin/users";

const handlers = createAdminUsersHandlers();

export const GET = handlers.GET;
export const POST = handlers.POST;
