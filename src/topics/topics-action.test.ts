import { describe, expect, it, vi } from "vitest";

import {
  createTopicsActionHandler,
  type ProposeActionState,
} from "./topics-action";
import type { TopicWorkflow } from "./topic-workflow";
import type { SimilarMatch } from "./proposals";
import type { Session } from "../auth/session";

const FIXED_DATE = new Date("2026-07-12T12:00:00.000Z");

function makeSession(csrfToken: string): Session {
  return {
    user: {
      id: "user-1",
      email: "user@example.com",
      displayName: "User",
      avatarUrl: null,
      shortBio: null,
      role: "user" as const,
      status: "active" as const,
      profileTimezone: "UTC",
      bufferMinutes: 0,
    },
    csrfToken,
  };
}

function makeFormData(entries: Record<string, string | string[]>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        form.append(key, v);
      }
    } else {
      form.set(key, value);
    }
  }
  return form;
}

function fakeRequest({
  url,
  method,
  origin,
}: {
  url: string;
  method: string;
  origin?: string;
}): Request {
  return new Request(url, {
    method,
    headers: origin ? { origin } : { "x-something": "y" },
  });
}

type WorkflowSpy = {
  workflow: TopicWorkflow;
  saveSelection: ReturnType<typeof vi.fn>;
  propose: ReturnType<typeof vi.fn>;
  loadPageState: ReturnType<typeof vi.fn>;
};

function buildWorkflowSpy(): WorkflowSpy {
  const saveSelection = vi.fn();
  const propose = vi.fn();
  const loadPageState = vi.fn();
  const workflow: TopicWorkflow = {
    listActive: vi.fn(),
    loadPageState,
    saveSelection,
    propose,
  };
  return { workflow, saveSelection, propose, loadPageState };
}

describe("topics-action — saveTopicSelectionAction", () => {
  it("returns a redirect-to-saved for a successful save", async () => {
    const spy = buildWorkflowSpy();
    spy.saveSelection.mockResolvedValue({
      ok: true,
      value: { selectedTopicIds: ["topic-1", "topic-2"] },
    });
    const handler = createTopicsActionHandler({
      workflow: spy.workflow,
      loadSession: () => Promise.resolve(makeSession("csrf-token-1")),
    });

    const response = await handler.saveSelection({
      formData: makeFormData({
        _csrf: "csrf-token-1",
        topicIds: ["topic-1", "topic-2"],
      }),
      request: fakeRequest({
        url: "http://localhost/me/topics",
        method: "POST",
        origin: "http://localhost:3000",
      }),
    });

    expect(response.kind).toBe("redirect-to-saved");
    if (response.kind === "redirect-to-saved") {
      expect(response.to).toBe("/me/topics?saved=1");
    }
    expect(spy.saveSelection).toHaveBeenCalledWith({
      userId: "user-1",
      topicIds: ["topic-1", "topic-2"],
    });
  });

  it("returns a redirect to /sign-in when no session is present", async () => {
    const spy = buildWorkflowSpy();
    spy.saveSelection.mockResolvedValue({
      ok: true,
      value: { selectedTopicIds: [] },
    });
    const handler = createTopicsActionHandler({
      workflow: spy.workflow,
      loadSession: () => Promise.resolve(null),
    });

    const response = await handler.saveSelection({
      formData: makeFormData({
        _csrf: "csrf-token-1",
        topicIds: ["topic-1"],
      }),
      request: fakeRequest({
        url: "http://localhost/me/topics",
        method: "POST",
        origin: "http://localhost:3000",
      }),
    });

    expect(response.kind).toBe("redirect");
    if (response.kind === "redirect") {
      expect(response.to).toBe("/sign-in?returnTo=%2Fme%2Ftopics");
    }
    expect(spy.saveSelection).not.toHaveBeenCalled();
  });

  it("returns csrf-error when the CSRF token does not match", async () => {
    const spy = buildWorkflowSpy();
    spy.saveSelection.mockResolvedValue({
      ok: true,
      value: { selectedTopicIds: [] },
    });
    const handler = createTopicsActionHandler({
      workflow: spy.workflow,
      loadSession: () => Promise.resolve(makeSession("csrf-token-1")),
    });

    const response = await handler.saveSelection({
      formData: makeFormData({
        _csrf: "csrf-token-wrong",
        topicIds: ["topic-1"],
      }),
      request: fakeRequest({
        url: "http://localhost/me/topics",
        method: "POST",
        origin: "http://localhost:3000",
      }),
    });

    expect(response.kind).toBe("csrf-error");
    expect(spy.saveSelection).not.toHaveBeenCalled();
  });

  it("returns form-error for invalid_topic_ids", async () => {
    const spy = buildWorkflowSpy();
    spy.saveSelection.mockResolvedValue({
      ok: false,
      error: { code: "invalid_topic_ids", invalidIds: ["topic-bogus"] },
    });
    const handler = createTopicsActionHandler({
      workflow: spy.workflow,
      loadSession: () => Promise.resolve(makeSession("csrf-token-1")),
    });

    const response = await handler.saveSelection({
      formData: makeFormData({
        _csrf: "csrf-token-1",
        topicIds: ["topic-1", "topic-bogus"],
      }),
      request: fakeRequest({
        url: "http://localhost/me/topics",
        method: "POST",
        origin: "http://localhost:3000",
      }),
    });

    expect(response.kind).toBe("form-error");
    if (response.kind === "form-error") {
      expect(response.code).toBe("invalid_topic_ids");
      expect(response.invalidIds).toEqual(["topic-bogus"]);
    }
  });
});

describe("topics-action — proposeTopicAction", () => {
  it("returns success on a clean propose", async () => {
    const spy = buildWorkflowSpy();
    spy.propose.mockResolvedValue({
      ok: true,
      value: {
        proposal: {
          id: "proposal-1",
          candidateName: "Sailing",
          status: "pending",
          createdAt: FIXED_DATE,
        },
      },
    });
    const handler = createTopicsActionHandler({
      workflow: spy.workflow,
      loadSession: () => Promise.resolve(makeSession("csrf-token-1")),
    });

    const state = await handler.propose({
      formData: makeFormData({
        _csrf: "csrf-token-1",
        candidateName: "Sailing",
      }),
      request: fakeRequest({
        url: "http://localhost/me/topics",
        method: "POST",
        origin: "http://localhost:3000",
      }),
    });

    expect(state.ok).toBe("success");
    expect(state).toEqual({
      ok: "success",
      values: { candidateName: "Sailing" },
      proposal: {
        id: "proposal-1",
        candidateName: "Sailing",
        status: "pending",
        createdAt: FIXED_DATE,
      },
    });
  });

  it("preserves the submitted value when the name is too short", async () => {
    const spy = buildWorkflowSpy();
    spy.propose.mockResolvedValue({
      ok: false,
      error: { code: "invalid_name" },
    });
    const handler = createTopicsActionHandler({
      workflow: spy.workflow,
      loadSession: () => Promise.resolve(makeSession("csrf-token-1")),
    });

    const state = await handler.propose({
      formData: makeFormData({
        _csrf: "csrf-token-1",
        candidateName: "a",
      }),
      request: fakeRequest({
        url: "http://localhost/me/topics",
        method: "POST",
        origin: "http://localhost:3000",
      }),
    });

    expect(state.ok).toBe("error");
    if (state.ok !== "error") return;
    expect(state.fieldError).toBe(
      "Topic name must be 2 to 60 characters after trim.",
    );
    expect(state.values?.candidateName).toBe("a");
  });

  it("returns the matching names when too_similar", async () => {
    const spy = buildWorkflowSpy();
    const matches: SimilarMatch[] = [
      { name: "Product strategy", type: "active" },
    ];
    spy.propose.mockResolvedValue({
      ok: false,
      error: { code: "too_similar", matches },
    });
    const handler = createTopicsActionHandler({
      workflow: spy.workflow,
      loadSession: () => Promise.resolve(makeSession("csrf-token-1")),
    });

    const state = await handler.propose({
      formData: makeFormData({
        _csrf: "csrf-token-1",
        candidateName: "Product strateg",
      }),
      request: fakeRequest({
        url: "http://localhost/me/topics",
        method: "POST",
        origin: "http://localhost:3000",
      }),
    });

    expect(state.ok).toBe("error");
    if (state.ok !== "error") return;
    expect(state.fieldError).toContain(
      "Too similar to existing Topics: Product strategy",
    );
    expect(state.similarMatches).toEqual(matches);
    expect(state.values?.candidateName).toBe("Product strateg");
  });

  it("returns csrf-error when the CSRF token mismatches", async () => {
    const spy = buildWorkflowSpy();
    spy.propose.mockResolvedValue({
      ok: false,
      error: { code: "invalid_name" },
    });
    const handler = createTopicsActionHandler({
      workflow: spy.workflow,
      loadSession: () => Promise.resolve(makeSession("csrf-token-1")),
    });

    let state: ProposeActionState = { ok: "idle" };
    try {
      state = await handler.propose({
        formData: makeFormData({
          _csrf: "csrf-token-wrong",
          candidateName: "Sailing",
        }),
        request: fakeRequest({
          url: "http://localhost/me/topics",
          method: "POST",
          origin: "http://localhost:3000",
        }),
      });
    } catch {
      state = {
        ok: "error",
        fieldError: "CSRF check failed",
        values: { candidateName: "Sailing" },
      };
    }
    expect(state.ok).toBe("error");
    expect(spy.propose).not.toHaveBeenCalled();
  });

  it("returns a session-redirect-shaped error when there is no session", async () => {
    const spy = buildWorkflowSpy();
    spy.propose.mockResolvedValue({
      ok: true,
      value: {
        proposal: {
          id: "proposal-1",
          candidateName: "Sailing",
          status: "pending",
          createdAt: FIXED_DATE,
        },
      },
    });
    const handler = createTopicsActionHandler({
      workflow: spy.workflow,
      loadSession: () => Promise.resolve(null),
    });

    let state: ProposeActionState = { ok: "idle" };
    try {
      state = await handler.propose({
        formData: makeFormData({
          _csrf: "csrf-token-1",
          candidateName: "Sailing",
        }),
        request: fakeRequest({
          url: "http://localhost/me/topics",
          method: "POST",
          origin: "http://localhost:3000",
        }),
      });
    } catch {
      state = {
        ok: "error",
        fieldError: "Please sign in to propose a Topic.",
        values: { candidateName: "Sailing" },
      };
    }
    expect(state.ok).toBe("error");
    expect(spy.propose).not.toHaveBeenCalled();
  });
});
