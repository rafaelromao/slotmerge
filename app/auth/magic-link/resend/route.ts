import { createMagicLinkResendHandler } from "../../../../src/auth/magic-link-resend";

const handlers = createMagicLinkResendHandler();

export const POST = (request: Request) => handlers.POST(request);