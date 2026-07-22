import { timingSafeEqual } from "node:crypto";

import {
  TOPIC_NAME_MIN_LENGTH,
  TOPIC_NAME_MAX_LENGTH,
  type TopicWorkflow,
} from "./topic-workflow";
import type { SimilarMatch } from "./proposals";
import type { Session } from "../auth/session";

export type ProposeActionState =
  | { ok: "idle" }
  | {
      ok: "success";
      values: { candidateName: string };
      proposal: {
        id: string;
        candidateName: string;
        status: string;
        createdAt: Date;
      };
    }
  | {
      ok: "error";
      fieldError: string;
      similarMatches?: SimilarMatch[];
      values: { candidateName: string };
    };

export type SaveSelectionResponse =
  | { kind: "redirect-to-saved"; to: string }
  | { kind: "redirect"; to: string }
  | { kind: "csrf-error" }
  | {
      kind: "form-error";
      code: "invalid_topic_ids";
      invalidIds: string[];
    };

export type CreateTopicsActionHandlerDeps = {
  workflow: TopicWorkflow;
  loadSession: (request: Request) => Promise<Session | null>;
};

export type TopicsActionHandler = {
  saveSelection(input: {
    formData: FormData;
    request: Request;
  }): Promise<SaveSelectionResponse>;
  propose(input: {
    formData: FormData;
    request: Request;
  }): Promise<ProposeActionState>;
};

export function createTopicsActionHandler(
  deps: CreateTopicsActionHandlerDeps,
): TopicsActionHandler {
  const { workflow, loadSession } = deps;

  return {
    async saveSelection({ formData, request }) {
      const session = await loadSession(request);

      if (!session) {
        return {
          kind: "redirect",
          to: `/sign-in?returnTo=${encodeURIComponent("/me/topics")}`,
        };
      }

      if (!csrfMatches(formData, session)) {
        return { kind: "csrf-error" };
      }

      const topicIds = normalizeTopicIds(
        formData
          .getAll("topicIds")
          .filter((value): value is string => typeof value === "string"),
      );

      const result = await workflow.saveSelection({
        userId: session.user.id,
        topicIds,
      });

      if (result.ok) {
        return {
          kind: "redirect-to-saved",
          to: "/me/topics?saved=1",
        };
      }

      return {
        kind: "form-error",
        code: "invalid_topic_ids",
        invalidIds: result.error.invalidIds,
      };
    },

    async propose({ formData, request }) {
      const candidateName = extractField(formData, "candidateName");
      const session = await loadSession(request);

      if (!session) {
        return {
          ok: "error",
          fieldError: "Please sign in to propose a Topic.",
          values: { candidateName },
        };
      }

      if (!csrfMatches(formData, session)) {
        return {
          ok: "error",
          fieldError: "CSRF check failed. Please reload and try again.",
          values: { candidateName },
        };
      }

      const result = await workflow.propose({
        userId: session.user.id,
        candidateName,
      });

      if (result.ok) {
        return {
          ok: "success",
          values: { candidateName },
          proposal: result.value.proposal,
        };
      }

      const fieldError = formatProposeError(result.error, candidateName);

      return {
        ok: "error",
        fieldError,
        similarMatches:
          result.error.code === "too_similar"
            ? result.error.matches
            : undefined,
        values: { candidateName },
      };
    },
  };
}

function csrfMatches(formData: FormData, session: Session): boolean {
  const token = formData.get("_csrf");
  if (typeof token !== "string" || !token) {
    return false;
  }
  const expected = session.csrfToken;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function normalizeTopicIds(values: ReadonlyArray<string>): string[] {
  return values.filter((value): value is string => typeof value === "string");
}

function extractField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function formatProposeError(
  error:
    | { code: "invalid_name" }
    | { code: "too_similar"; matches: SimilarMatch[] }
    | { code: "already_pending"; proposalId: string },
  candidateName: string,
): string {
  if (error.code === "too_similar") {
    const names = error.matches.map((match) => match.name).join(", ");
    return `Too similar to existing Topics: ${names}. Please pick a different name.`;
  }
  if (error.code === "already_pending") {
    return `You already have a pending proposal for "${candidateName.trim()}". Wait for Admin review.`;
  }
  return `Topic name must be ${TOPIC_NAME_MIN_LENGTH} to ${TOPIC_NAME_MAX_LENGTH} characters after trim.`;
}
