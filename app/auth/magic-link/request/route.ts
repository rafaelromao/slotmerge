import { createMagicLinkRequestHandlers } from "../../../../src/auth/magic-link-request";

const handlers = createMagicLinkRequestHandlers({});

export const POST = handlers.POST;
