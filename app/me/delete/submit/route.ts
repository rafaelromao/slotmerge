import { getAccountRepository } from "../../../../src/account/repository";
import { getSessionFromRequest } from "../../../../src/auth/session";
import { loadRuntimeConfig } from "../../../../src/config/runtime";
import {
  createAccountWorkflow,
  type AccountWorkflow,
} from "../../../../src/workflow/account";
import { createSelfDeleteActionHandler } from "../../../(product)/me/_actions/self-delete-handler";

const accountWorkflow: AccountWorkflow = {
  selfDelete(input) {
    return createAccountWorkflow({
      repository: getAccountRepository(),
    }).selfDelete(input);
  },
};

export const selfDeleteAction = createSelfDeleteActionHandler({
  workflow: accountWorkflow,
  loadSession: getSessionFromRequest,
  expectedOrigin: () => new URL(loadRuntimeConfig().appPublicUrl).origin,
});

export const POST = selfDeleteAction;
