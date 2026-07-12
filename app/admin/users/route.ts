import { createAdminUsersHandlers } from "../../../src/admin/users";

export const GET = async (request: Request): Promise<Response> =>
  createAdminUsersHandlers().GET(request);

export const POST = async (request: Request): Promise<Response> =>
  createAdminUsersHandlers().POST(request);
