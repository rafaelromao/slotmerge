import { createMagicLinkResendHandler } from "../../../../src/auth/magic-link-resend";

export const dynamic = "force-dynamic";

let handlers: ReturnType<typeof createMagicLinkResendHandler> | undefined;

export const POST = (request: Request) => {
  handlers ??= createMagicLinkResendHandler();
  return handlers.POST(request);
};
