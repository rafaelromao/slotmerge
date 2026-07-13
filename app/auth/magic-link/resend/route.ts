import { createMagicLinkResendHandlers } from "../../../../src/auth/magic-link-resend";

export const dynamic = "force-dynamic";

let handlers: ReturnType<typeof createMagicLinkResendHandlers> | undefined;

export const POST = (request: Request) => {
  handlers ??= createMagicLinkResendHandlers();
  return handlers.POST(request);
};