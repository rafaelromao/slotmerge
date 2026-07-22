import { createMagicLinkResendHandlers } from "../../../../src/auth/magic-link-resend";
import { systemDependencies } from "../../../../src/system";
import { authWorkflow } from "../../../../src/workflow/auth";

export const dynamic = "force-dynamic";

let handlers: ReturnType<typeof createMagicLinkResendHandlers> | undefined;

export const POST = (request: Request) => {
  handlers ??= createMagicLinkResendHandlers({
    ...systemDependencies(),
    requestMagicLink: authWorkflow.requestMagicLink.bind(authWorkflow),
  });
  return handlers.POST(request);
};
