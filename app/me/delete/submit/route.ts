import { createPostgresAccountRepository } from "../../../../src/account/repository";
import { getSessionFromRequest } from "../../../../src/auth/session";
import { loadRuntimeConfig } from "../../../../src/config/runtime";
import { createAccountWorkflow } from "../../../../src/workflow/account";
import { createSelfDeleteActionHandler } from "../../../(product)/me/_actions/self-delete-handler";

export const selfDeleteAction = createSelfDeleteActionHandler({
  workflow: createAccountWorkflow({
    repository: createPostgresAccountRepository(),
  }),
  loadSession: getSessionFromRequest,
  expectedOrigin: new URL(loadRuntimeConfig().appPublicUrl).origin,
});

export const POST = selfDeleteAction;
