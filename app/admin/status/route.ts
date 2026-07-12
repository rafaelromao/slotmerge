import { createAdminStatusHandlers } from "../../../src/admin/operational-status";
import { createPostgresOperationalStatusRepository } from "../../../src/admin/operational-status-repository";

const handlers = createAdminStatusHandlers({
  statusRepository: createPostgresOperationalStatusRepository(),
});

export const GET = handlers.GET;
