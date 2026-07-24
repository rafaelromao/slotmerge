import { err, ok, type Result } from "../lib/result";

export type AccountError = { code: "user_not_found" };

export type AccountRepository = {
  selfDelete(userId: string): Promise<boolean>;
};

export type AccountWorkflow = {
  selfDelete(input: {
    userId: string;
  }): Promise<Result<void, AccountError>>;
};

export function createAccountWorkflow(deps: {
  repository: AccountRepository;
}): AccountWorkflow {
  return {
    async selfDelete({ userId }) {
      const deleted = await deps.repository.selfDelete(userId);
      return deleted ? ok(undefined) : err({ code: "user_not_found" });
    },
  };
}
