import { createMagicLinkVerifyHandlers } from "../../../../src/auth/magic-link-verify";
import { systemDependencies } from "../../../../src/system";

const handlers = createMagicLinkVerifyHandlers(systemDependencies());

export const GET = (request: Request) => handlers.GET(request);
export const POST = (request: Request) => handlers.POST(request);
