// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: () => ({
    toString: () => "slotmerge_session=dummy",
    entries: () => [] as never,
    get: () => undefined,
    forEach: () => undefined,
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    const error = new Error("NEXT_REDIRECT");
    (error as Error & { digest?: string }).digest = `NEXT_REDIRECT;303;${url};`;
    throw error;
  },
}));

vi.mock("../../../../src/auth/session", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../src/auth/session")
  >("../../../../src/auth/session");
  return {
    ...actual,
    getServerSession: vi.fn(),
    sealSessionCookieValue: actual.sealSessionCookieValue,
  };
});

vi.mock("../../../../src/workflow/admin-topics", () => ({
  createAdminTopicsWorkflow: vi.fn(),
}));

vi.mock("../../../../src/topics/repository", () => ({
  getTopicAdminRepository: vi.fn(() => ({
    listActiveTopics: vi.fn(),
    listPendingProposals: vi.fn(),
    findTopic: vi.fn(),
    decideProposal: vi.fn(),
    retireTopic: vi.fn(),
  })),
}));

vi.mock("../../../../src/system/clock", () => ({
  systemClock: vi.fn(() => ({ now: () => new Date("2026-07-12T12:00:00.000Z") })),
}));

import * as sessionModule from "../../../../src/auth/session";
import { createAdminTopicsWorkflow } from "../../../../src/workflow/admin-topics";

function buildFormData(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [k, v] of Object.entries(values)) {
    formData.set(k, v);
  }
  return formData;
}

function setSession(role: "admin" | "user" | null) {
  if (role === null) {
    vi.mocked(sessionModule.getServerSession).mockResolvedValue(null);
    return;
  }
  vi.mocked(sessionModule.getServerSession).mockResolvedValue({
    user: {
      id: "admin-1",
      email: "admin@example.com",
      displayName: "Carol Admin",
      avatarUrl: null,
      shortBio: null,
      role,
      status: "active",
      profileTimezone: null,
      bufferMinutes: 0,
    },
    csrfToken: "csrf-admin-1",
  });
}

function captureRedirect(
  promise: Promise<unknown>,
): Promise<string> {
  return promise
    .then(() => "")
    .catch((error: Error & { digest?: string }) => error.digest ?? "");
}

function mockWorkflow(
  decideProposal: unknown,
  retireTopic: unknown,
): void {
  vi.mocked(createAdminTopicsWorkflow).mockReturnValue({
    load: vi.fn().mockResolvedValue({
      ok: true,
      value: { activeTopics: [], pendingProposals: [], activeCount: 0, pendingCount: 0 },
    }),
    decideProposal: vi.fn().mockImplementation(decideProposal as never),
    retireTopic: vi.fn().mockImplementation(retireTopic as never),
  });
}

describe("approveProposalAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSession("admin");
  });

  it("redirects to /sign-in when there is no session", async () => {
    setSession(null);
    const { approveProposalAction } = await import("./topics");
    const digest = await captureRedirect(
      approveProposalAction(
        buildFormData({ proposalId: "p-1", _csrf: "csrf-admin-1" }),
      ),
    );
    expect(digest).toContain("/sign-in");
    expect(digest).toContain("%2Fadmin");
  });

  it("redirects to /sign-in when the session is not admin", async () => {
    setSession("user");
    const { approveProposalAction } = await import("./topics");
    const digest = await captureRedirect(
      approveProposalAction(
        buildFormData({ proposalId: "p-1", _csrf: "csrf-admin-1" }),
      ),
    );
    expect(digest).toContain("/sign-in");
    expect(digest).toContain("%2Fadmin");
  });

  it("redirects to /admin?csrf=failed when the CSRF token does not match", async () => {
    const { approveProposalAction } = await import("./topics");
    const digest = await captureRedirect(
      approveProposalAction(
        buildFormData({ proposalId: "p-1", _csrf: "wrong" }),
      ),
    );
    expect(digest).toContain("/admin?csrf=failed#topics");
  });

  it("redirects with topic_invalid_proposal when the proposalId is missing", async () => {
    mockWorkflow(
      () => Promise.resolve({ ok: true, value: { topicId: "topic-new" } }),
      () => Promise.resolve({ ok: true, value: undefined }),
    );
    const { approveProposalAction } = await import("./topics");
    const digest = await captureRedirect(
      approveProposalAction(buildFormData({ _csrf: "csrf-admin-1" })),
    );
    expect(digest).toContain("/admin?error=topic_proposal_invalid#topics");
  });

  it("invokes the workflow with status 'approved' and redirects on success", async () => {
    const decideProposal = vi.fn().mockResolvedValue({
      ok: true,
      value: { topicId: "topic-new" },
    });
    mockWorkflow(decideProposal, () => Promise.resolve({ ok: true, value: undefined }));
    const { approveProposalAction } = await import("./topics");
    const digest = await captureRedirect(
      approveProposalAction(
        buildFormData({ proposalId: "p-1", _csrf: "csrf-admin-1" }),
      ),
    );
    expect(digest).toContain("/admin?action=topic_approved#topics");
    expect(decideProposal).toHaveBeenCalledWith({
      actorId: "admin-1",
      proposalId: "p-1",
      status: "approved",
    });
  });

  it("redirects with topic_proposal_not_found error slug on missing proposal", async () => {
    mockWorkflow(
      () =>
        Promise.resolve({
          ok: false,
          error: "proposal_not_found",
        }),
      () => Promise.resolve({ ok: true, value: undefined }),
    );
    const { approveProposalAction } = await import("./topics");
    const digest = await captureRedirect(
      approveProposalAction(
        buildFormData({ proposalId: "missing", _csrf: "csrf-admin-1" }),
      ),
    );
    expect(digest).toContain("/admin?error=topic_proposal_not_found#topics");
  });

  it("redirects with topic_proposal_already_decided error slug", async () => {
    mockWorkflow(
      () =>
        Promise.resolve({
          ok: false,
          error: "proposal_already_decided",
        }),
      () => Promise.resolve({ ok: true, value: undefined }),
    );
    const { approveProposalAction } = await import("./topics");
    const digest = await captureRedirect(
      approveProposalAction(
        buildFormData({ proposalId: "decided", _csrf: "csrf-admin-1" }),
      ),
    );
    expect(digest).toContain("/admin?error=topic_proposal_already_decided#topics");
  });
});

describe("rejectProposalAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSession("admin");
  });

  it("invokes the workflow with status 'rejected' on success and redirects to topic_rejected", async () => {
    const decideProposal = vi
      .fn()
      .mockResolvedValue({ ok: true, value: { topicId: null } });
    mockWorkflow(decideProposal, () => Promise.resolve({ ok: true, value: undefined }));
    const { rejectProposalAction } = await import("./topics");
    const digest = await captureRedirect(
      rejectProposalAction(
        buildFormData({ proposalId: "p-1", _csrf: "csrf-admin-1" }),
      ),
    );
    expect(digest).toContain("/admin?action=topic_rejected#topics");
    expect(decideProposal).toHaveBeenCalledWith({
      actorId: "admin-1",
      proposalId: "p-1",
      status: "rejected",
    });
  });

  it("redirects with topic_invalid_proposal when the proposalId is missing", async () => {
    mockWorkflow(
      () => Promise.resolve({ ok: true, value: { topicId: null } }),
      () => Promise.resolve({ ok: true, value: undefined }),
    );
    const { rejectProposalAction } = await import("./topics");
    const digest = await captureRedirect(
      rejectProposalAction(buildFormData({ _csrf: "csrf-admin-1" })),
    );
    expect(digest).toContain("/admin?error=topic_proposal_invalid#topics");
  });
});

describe("retireTopicAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSession("admin");
  });

  it("invokes retireTopic with the typed-confirm name and redirects on success", async () => {
    const retireTopic = vi.fn().mockResolvedValue({ ok: true, value: undefined });
    mockWorkflow(
      () => Promise.resolve({ ok: true, value: { topicId: null } }),
      retireTopic,
    );
    const { retireTopicAction } = await import("./topics");
    const digest = await captureRedirect(
      retireTopicAction(
        buildFormData({
          topicId: "topic-1",
          confirmName: "Sailing",
          _csrf: "csrf-admin-1",
        }),
      ),
    );
    expect(digest).toContain("/admin?action=topic_retired#topics");
    expect(retireTopic).toHaveBeenCalledWith({
      actorId: "admin-1",
      topicId: "topic-1",
      confirmName: "Sailing",
    });
  });

  it("redirects with topic_cannot_retire_own_proposal when the actor proposed the topic", async () => {
    mockWorkflow(
      () => Promise.resolve({ ok: true, value: { topicId: null } }),
      () =>
        Promise.resolve({
          ok: false,
          error: "cannot_retire_own_proposal",
        }),
    );
    const { retireTopicAction } = await import("./topics");
    const digest = await captureRedirect(
      retireTopicAction(
        buildFormData({
          topicId: "topic-self",
          confirmName: "Sailing",
          _csrf: "csrf-admin-1",
        }),
      ),
    );
    expect(digest).toContain(
      "/admin?error=topic_cannot_retire_own_proposal#topics",
    );
  });

  it("redirects with topic_confirm_name_mismatch when the typed name does not match", async () => {
    mockWorkflow(
      () => Promise.resolve({ ok: true, value: { topicId: null } }),
      () =>
        Promise.resolve({
          ok: false,
          error: "confirm_name_mismatch",
        }),
    );
    const { retireTopicAction } = await import("./topics");
    const digest = await captureRedirect(
      retireTopicAction(
        buildFormData({
          topicId: "topic-1",
          confirmName: "Wrong Name",
          _csrf: "csrf-admin-1",
        }),
      ),
    );
    expect(digest).toContain(
      "/admin?error=topic_confirm_name_mismatch#topics",
    );
  });

  it("redirects with topic_confirm_name_required when the confirmName is empty", async () => {
    mockWorkflow(
      () => Promise.resolve({ ok: true, value: { topicId: null } }),
      () =>
        Promise.resolve({
          ok: false,
          error: "confirm_name_required",
        }),
    );
    const { retireTopicAction } = await import("./topics");
    const digest = await captureRedirect(
      retireTopicAction(
        buildFormData({
          topicId: "topic-1",
          confirmName: "",
          _csrf: "csrf-admin-1",
        }),
      ),
    );
    expect(digest).toContain(
      "/admin?error=topic_confirm_name_required#topics",
    );
  });

  it("redirects with topic_not_found when the topic id is missing", async () => {
    mockWorkflow(
      () => Promise.resolve({ ok: true, value: { topicId: null } }),
      () =>
        Promise.resolve({
          ok: false,
          error: "topic_not_found",
        }),
    );
    const { retireTopicAction } = await import("./topics");
    const digest = await captureRedirect(
      retireTopicAction(
        buildFormData({
          confirmName: "Sailing",
          _csrf: "csrf-admin-1",
        }),
      ),
    );
    expect(digest).toContain("/admin?error=topic_invalid_topic#topics");
  });
});
