import { createMagicLinkRequestHandlers } from "../../../../src/auth/magic-link-request";
import { systemDependencies } from "../../../../src/system";

export const dynamic = "force-dynamic";

let handlers: ReturnType<typeof createMagicLinkRequestHandlers> | undefined;

export const POST = (request: Request) => {
  handlers ??= createMagicLinkRequestHandlers(systemDependencies());
  return handlers.POST(request);
};
