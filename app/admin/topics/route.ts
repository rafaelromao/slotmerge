import { createAdminTopicsHandlers } from "../../../src/admin/topics";

const handlers = createAdminTopicsHandlers();

export const GET = handlers.GET;
export const POST = handlers.POST;
