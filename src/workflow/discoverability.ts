import { ok, err, type Result } from "../lib/result";
import type { DiscoverabilityConsentRepository } from "../profile/discoverability-consent";

export type ProfileErrorCode =
  "consent_required" | "consent_already_granted" | "consent_already_revoked";

export type ProfileError = {
  code: ProfileErrorCode;
};

export type DiscoverabilityWorkflow = {
  set(input: {
    userId: string;
    granted: boolean;
    confirmed?: boolean;
  }): Promise<Result<{ discoverable: boolean }, ProfileError>>;
};

export type CreateDiscoverabilityWorkflowDeps = {
  repository: DiscoverabilityConsentRepository;
};

export function createDiscoverabilityWorkflow(
  deps: CreateDiscoverabilityWorkflowDeps,
): DiscoverabilityWorkflow {
  const { repository } = deps;

  return {
    async set({
      userId,
      granted,
      confirmed,
    }): Promise<Result<{ discoverable: boolean }, ProfileError>> {
      if (granted) {
        if (confirmed !== true) {
          return err({ code: "consent_required" });
        }

        const existing = await repository.findByUserId(userId);
        if (existing?.state === "granted") {
          return err({ code: "consent_already_granted" });
        }

        await repository.grant(userId);
        return ok({ discoverable: true });
      }

      const existing = await repository.findByUserId(userId);
      if (existing?.state === "revoked") {
        return err({ code: "consent_already_revoked" });
      }

      await repository.revoke(userId);
      return ok({ discoverable: false });
    },
  };
}
