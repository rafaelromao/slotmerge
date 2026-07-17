import { createMagicLinkResendHandlers } from "../../../../src/auth/magic-link-resend";
import { systemDependencies } from "../../../../src/system";

export const dynamic = "force-dynamic";

let handlers: ReturnType<typeof createMagicLinkResendHandlers> | undefined;

export const POST = (request: Request) => {
  handlers ??= createMagicLinkResendHandlers(systemDependencies());
  return handlers.POST(request);
};
