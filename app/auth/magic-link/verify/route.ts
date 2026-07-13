import { createMagicLinkVerifyHandlers } from "../../../../src/auth/magic-link-verify";

const handlers = createMagicLinkVerifyHandlers();

export const GET = (request: Request) => handlers.GET(request);
export const POST = (request: Request) => handlers.POST(request);
