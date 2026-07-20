import { createAdminStatusHandlers } from "../../../src/admin/operational-status";
import { systemDependencies } from "../../../src/system";

const handlers = createAdminStatusHandlers(systemDependencies());

export const GET = handlers.GET;
