import { createAdminUsersHandlers } from "../../../src/admin/users";
import { systemDependencies } from "../../../src/system";

const handlers = createAdminUsersHandlers(systemDependencies());

export const GET = handlers.GET;
export const POST = handlers.POST;
