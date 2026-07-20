import { createAdminTopicsHandlers } from "../../../src/admin/topics";
import { systemDependencies } from "../../../src/system";

const handlers = createAdminTopicsHandlers(systemDependencies());

export const GET = handlers.GET;
export const POST = handlers.POST;
