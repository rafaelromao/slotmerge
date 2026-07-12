import { createAdminStatusHandlers } from "../../../src/admin/operational-status";

const handlers = createAdminStatusHandlers();

export const GET = handlers.GET;
