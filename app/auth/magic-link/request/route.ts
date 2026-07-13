import { createMagicLinkRequestHandlers } from "../../../../src/auth/magic-link-request";

export const dynamic = "force-dynamic";

let handlers: ReturnType<typeof createMagicLinkRequestHandlers> | undefined;

export const POST = (request: Request) => {
  handlers ??= createMagicLinkRequestHandlers();
  return handlers.POST(request);
};
