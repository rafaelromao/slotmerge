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

vi.mock("../../../../src/admin/users.workflow", () => ({
  createAdminUsersWorkflow: vi.fn(),
}));

vi.mock("../../../../src/admin/users.repository", () => ({
  createPostgresAdminUserRepository: vi.fn(() => ({})),
}));

vi.mock("../../../../src/admin/invites.repository", () => ({
  createPostgresInviteRepository: vi.fn(() => ({})),
}));

vi.mock("../../../../src/email/repository", () => ({
  createPostgresEmailEventRepository: vi.fn(() => ({})),
}));

vi.mock("../../../../src/email/service", () => ({
  createEmailDeliveryService: vi.fn(() => ({})),
}));

vi.mock("../../../../src/email/invite-jobs", () => ({
  enqueueInviteEmailJob: vi.fn(),
}));

vi.mock("../../../../src/auth/magic-link", () => ({
  createMagicLinkTokenIssuer: vi.fn(() => ({})),
}));

vi.mock("../../../../src/config/runtime", () => ({
  loadRuntimeConfig: vi.fn(() => ({
    appBaseUrl: "http://localhost:3000",
    magicLinkSecret: "test-secret-1234567890abcdef",
  })),
}));

import * as sessionModule from "../../../../src/auth/session";
import { createAdminUsersWorkflow } from "../../../../src/admin/users.workflow";

async function importAction() {
  const mod = await import("./users");
  return mod.inviteUserAction;
}

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

describe("inviteUserAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSession("admin");
  });

  it("redirects to /sign-in when there is no session", async () => {
    setSession(null);
    const action = await importAction();

    let digest = "";
    try {
      await action(
        buildFormData({ email: "new@example.com", _csrf: "csrf-admin-1" }),
      );
    } catch (error) {
      digest = (error as Error & { digest?: string }).digest ?? "";
    }
    expect(digest).toContain("/sign-in");
  });

  it("redirects to /sign-in when the session is not admin", async () => {
    setSession("user");
    const action = await importAction();

    let digest = "";
    try {
      await action(
        buildFormData({ email: "new@example.com", _csrf: "csrf-admin-1" }),
      );
    } catch (error) {
      digest = (error as Error & { digest?: string }).digest ?? "";
    }
    expect(digest).toContain("/sign-in");
  });

  it("rejects the request with a CSRF failure when the token does not match", async () => {
    const action = await importAction();

    let digest = "";
    try {
      await action(buildFormData({ email: "new@example.com", _csrf: "wrong" }));
    } catch (error) {
      digest = (error as Error & { digest?: string }).digest ?? "";
    }
    expect(digest).toBe("");
  });

  it("redirects with the masked email on success", async () => {
    vi.mocked(createAdminUsersWorkflow).mockReturnValue({
      load: vi.fn(),
      inviteUser: vi.fn().mockResolvedValue({
        ok: true,
        maskedEmail: "ne***@example.com",
        inviteId: "invite-1",
      }),
      changeRole: vi.fn(),
      suspend: vi.fn(),
      reinstate: vi.fn(),
      resendInvite: vi.fn(),
    });

    const action = await importAction();
    let digest = "";
    try {
      await action(
        buildFormData({
          email: "new@example.com",
          role: "user",
          _csrf: "csrf-admin-1",
        }),
      );
    } catch (error) {
      digest = (error as Error & { digest?: string }).digest ?? "";
    }
    expect(digest).toContain(
      "NEXT_REDIRECT;303;/admin?invited=ne***%40example.com;",
    );
  });

  it("redirects to /admin?error=self_invite when the workflow returns self_invite", async () => {
    vi.mocked(createAdminUsersWorkflow).mockReturnValue({
      load: vi.fn(),
      inviteUser: vi.fn().mockResolvedValue({
        ok: false,
        reason: "self_invite",
      }),
      changeRole: vi.fn(),
      suspend: vi.fn(),
      reinstate: vi.fn(),
      resendInvite: vi.fn(),
    });

    const action = await importAction();
    let digest = "";
    try {
      await action(
        buildFormData({
          email: "admin@example.com",
          role: "user",
          _csrf: "csrf-admin-1",
        }),
      );
    } catch (error) {
      digest = (error as Error & { digest?: string }).digest ?? "";
    }
    expect(digest).toContain("NEXT_REDIRECT;303;/admin?error=self_invite;");
  });

  it("redirects to /admin?error=email_already_invited when the workflow returns that", async () => {
    vi.mocked(createAdminUsersWorkflow).mockReturnValue({
      load: vi.fn(),
      inviteUser: vi.fn().mockResolvedValue({
        ok: false,
        reason: "email_already_invited",
      }),
      changeRole: vi.fn(),
      suspend: vi.fn(),
      reinstate: vi.fn(),
      resendInvite: vi.fn(),
    });

    const action = await importAction();
    let digest = "";
    try {
      await action(
        buildFormData({
          email: "ada@example.com",
          role: "user",
          _csrf: "csrf-admin-1",
        }),
      );
    } catch (error) {
      digest = (error as Error & { digest?: string }).digest ?? "";
    }
    expect(digest).toContain(
      "NEXT_REDIRECT;303;/admin?error=email_already_invited;",
    );
  });

  it("redirects to /admin?error=invalid_invite when the email is empty", async () => {
    const action = await importAction();
    let digest = "";
    try {
      await action(
        buildFormData({
          email: "",
          role: "user",
          _csrf: "csrf-admin-1",
        }),
      );
    } catch (error) {
      digest = (error as Error & { digest?: string }).digest ?? "";
    }
    expect(digest).toContain("NEXT_REDIRECT;303;/admin?error=invalid_invite;");
  });
});

async function importChangeRoleAction() {
  const mod = await import("./users");
  return mod.changeRoleAction;
}

describe("changeRoleAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSession("admin");
  });

  it("redirects to /admin?role_change=saved on success", async () => {
    vi.mocked(createAdminUsersWorkflow).mockReturnValue({
      load: vi.fn(),
      inviteUser: vi.fn(),
      changeRole: vi.fn().mockResolvedValue({ ok: true }),
      suspend: vi.fn(),
      reinstate: vi.fn(),
      resendInvite: vi.fn(),
    });

    const action = await importChangeRoleAction();
    let digest = "";
    try {
      await action(
        buildFormData({
          userId: "u-2",
          role: "organizer",
          _csrf: "csrf-admin-1",
        }),
      );
    } catch (error) {
      digest = (error as Error & { digest?: string }).digest ?? "";
    }
    expect(digest).toContain("NEXT_REDIRECT;303;/admin?role_change=saved;");
  });

  it("redirects to /admin?error=self_role_change when the actor targets themselves", async () => {
    vi.mocked(createAdminUsersWorkflow).mockReturnValue({
      load: vi.fn(),
      inviteUser: vi.fn(),
      changeRole: vi.fn().mockResolvedValue({
        ok: false,
        reason: "self_role_change",
      }),
      suspend: vi.fn(),
      reinstate: vi.fn(),
      resendInvite: vi.fn(),
    });

    const action = await importChangeRoleAction();
    let digest = "";
    try {
      await action(
        buildFormData({
          userId: "admin-1",
          role: "user",
          _csrf: "csrf-admin-1",
        }),
      );
    } catch (error) {
      digest = (error as Error & { digest?: string }).digest ?? "";
    }
    expect(digest).toContain(
      "NEXT_REDIRECT;303;/admin?error=self_role_change;",
    );
  });

  it("redirects to /admin?error=invalid_role_change when userId is missing", async () => {
    const action = await importChangeRoleAction();
    let digest = "";
    try {
      await action(
        buildFormData({
          role: "user",
          _csrf: "csrf-admin-1",
        }),
      );
    } catch (error) {
      digest = (error as Error & { digest?: string }).digest ?? "";
    }
    expect(digest).toContain(
      "NEXT_REDIRECT;303;/admin?error=invalid_role_change;",
    );
  });
});

async function importSuspendAction() {
  const mod = await import("./users");
  return mod.suspendAction;
}

describe("suspendAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSession("admin");
  });

  it("redirects to /admin?action=suspended on success", async () => {
    vi.mocked(createAdminUsersWorkflow).mockReturnValue({
      load: vi.fn(),
      inviteUser: vi.fn(),
      changeRole: vi.fn(),
      suspend: vi.fn().mockResolvedValue({ ok: true }),
      reinstate: vi.fn(),
      resendInvite: vi.fn(),
    });

    const action = await importSuspendAction();
    let digest = "";
    try {
      await action(
        buildFormData({
          userId: "u-2",
          confirmEmail: "ada@example.com",
          _csrf: "csrf-admin-1",
        }),
      );
    } catch (error) {
      digest = (error as Error & { digest?: string }).digest ?? "";
    }
    expect(digest).toContain("NEXT_REDIRECT;303;/admin?action=suspended;");
  });

  it("redirects to /admin?error=self_suspend when the actor targets themselves", async () => {
    vi.mocked(createAdminUsersWorkflow).mockReturnValue({
      load: vi.fn(),
      inviteUser: vi.fn(),
      changeRole: vi.fn(),
      suspend: vi.fn().mockResolvedValue({
        ok: false,
        reason: "self_suspend",
      }),
      reinstate: vi.fn(),
      resendInvite: vi.fn(),
    });

    const action = await importSuspendAction();
    let digest = "";
    try {
      await action(
        buildFormData({
          userId: "admin-1",
          confirmEmail: "admin@example.com",
          _csrf: "csrf-admin-1",
        }),
      );
    } catch (error) {
      digest = (error as Error & { digest?: string }).digest ?? "";
    }
    expect(digest).toContain("NEXT_REDIRECT;303;/admin?error=self_suspend;");
  });

  it("redirects to /admin?error=user_already_suspended when the user is already suspended", async () => {
    vi.mocked(createAdminUsersWorkflow).mockReturnValue({
      load: vi.fn(),
      inviteUser: vi.fn(),
      changeRole: vi.fn(),
      suspend: vi.fn().mockResolvedValue({
        ok: false,
        reason: "user_already_suspended",
      }),
      reinstate: vi.fn(),
      resendInvite: vi.fn(),
    });

    const action = await importSuspendAction();
    let digest = "";
    try {
      await action(
        buildFormData({
          userId: "u-2",
          confirmEmail: "ada@example.com",
          _csrf: "csrf-admin-1",
        }),
      );
    } catch (error) {
      digest = (error as Error & { digest?: string }).digest ?? "";
    }
    expect(digest).toContain(
      "NEXT_REDIRECT;303;/admin?error=user_already_suspended;",
    );
  });

  it("redirects to /admin?error=invalid_suspend when userId is missing", async () => {
    const action = await importSuspendAction();
    let digest = "";
    try {
      await action(
        buildFormData({
          confirmEmail: "ada@example.com",
          _csrf: "csrf-admin-1",
        }),
      );
    } catch (error) {
      digest = (error as Error & { digest?: string }).digest ?? "";
    }
    expect(digest).toContain("NEXT_REDIRECT;303;/admin?error=invalid_suspend;");
  });
});

async function importReinstateAction() {
  const mod = await import("./users");
  return mod.reinstateAction;
}

describe("reinstateAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSession("admin");
  });

  it("redirects to /admin?action=reinstated on success", async () => {
    vi.mocked(createAdminUsersWorkflow).mockReturnValue({
      load: vi.fn(),
      inviteUser: vi.fn(),
      changeRole: vi.fn(),
      suspend: vi.fn(),
      reinstate: vi.fn().mockResolvedValue({ ok: true }),
      resendInvite: vi.fn(),
    });

    const action = await importReinstateAction();
    let digest = "";
    try {
      await action(
        buildFormData({
          userId: "u-2",
          _csrf: "csrf-admin-1",
        }),
      );
    } catch (error) {
      digest = (error as Error & { digest?: string }).digest ?? "";
    }
    expect(digest).toContain("NEXT_REDIRECT;303;/admin?action=reinstated;");
  });

  it("redirects to /admin?error=self_reinstate when the actor targets themselves", async () => {
    vi.mocked(createAdminUsersWorkflow).mockReturnValue({
      load: vi.fn(),
      inviteUser: vi.fn(),
      changeRole: vi.fn(),
      suspend: vi.fn(),
      reinstate: vi.fn().mockResolvedValue({
        ok: false,
        reason: "self_reinstate",
      }),
      resendInvite: vi.fn(),
    });

    const action = await importReinstateAction();
    let digest = "";
    try {
      await action(
        buildFormData({
          userId: "admin-1",
          _csrf: "csrf-admin-1",
        }),
      );
    } catch (error) {
      digest = (error as Error & { digest?: string }).digest ?? "";
    }
    expect(digest).toContain("NEXT_REDIRECT;303;/admin?error=self_reinstate;");
  });

  it("redirects to /admin?error=user_already_active when the user is already active", async () => {
    vi.mocked(createAdminUsersWorkflow).mockReturnValue({
      load: vi.fn(),
      inviteUser: vi.fn(),
      changeRole: vi.fn(),
      suspend: vi.fn(),
      reinstate: vi.fn().mockResolvedValue({
        ok: false,
        reason: "user_already_active",
      }),
      resendInvite: vi.fn(),
    });

    const action = await importReinstateAction();
    let digest = "";
    try {
      await action(
        buildFormData({
          userId: "u-2",
          _csrf: "csrf-admin-1",
        }),
      );
    } catch (error) {
      digest = (error as Error & { digest?: string }).digest ?? "";
    }
    expect(digest).toContain(
      "NEXT_REDIRECT;303;/admin?error=user_already_active;",
    );
  });

  it("redirects to /admin?error=invalid_reinstate when userId is missing", async () => {
    const action = await importReinstateAction();
    let digest = "";
    try {
      await action(buildFormData({ _csrf: "csrf-admin-1" }));
    } catch (error) {
      digest = (error as Error & { digest?: string }).digest ?? "";
    }
    expect(digest).toContain(
      "NEXT_REDIRECT;303;/admin?error=invalid_reinstate;",
    );
  });
});

async function importResendInviteAction() {
  const mod = await import("./users");
  return mod.resendInviteAction;
}

describe("resendInviteAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSession("admin");
  });

  it("redirects to /admin?invited=<masked> on success", async () => {
    vi.mocked(createAdminUsersWorkflow).mockReturnValue({
      load: vi.fn(),
      inviteUser: vi.fn(),
      changeRole: vi.fn(),
      suspend: vi.fn(),
      reinstate: vi.fn(),
      resendInvite: vi.fn().mockResolvedValue({
        ok: true,
        maskedEmail: "ne***@example.com",
        inviteId: "invite-2",
      }),
    });

    const action = await importResendInviteAction();
    let digest = "";
    try {
      await action(
        buildFormData({
          inviteId: "invite-1",
          _csrf: "csrf-admin-1",
        }),
      );
    } catch (error) {
      digest = (error as Error & { digest?: string }).digest ?? "";
    }
    expect(digest).toContain(
      "NEXT_REDIRECT;303;/admin?invited=ne***%40example.com;",
    );
  });

  it("redirects to /admin?error=invite_not_found when the workflow rejects", async () => {
    vi.mocked(createAdminUsersWorkflow).mockReturnValue({
      load: vi.fn(),
      inviteUser: vi.fn(),
      changeRole: vi.fn(),
      suspend: vi.fn(),
      reinstate: vi.fn(),
      resendInvite: vi.fn().mockResolvedValue({
        ok: false,
        reason: "invite_not_found",
      }),
    });

    const action = await importResendInviteAction();
    let digest = "";
    try {
      await action(
        buildFormData({
          inviteId: "invite-missing",
          _csrf: "csrf-admin-1",
        }),
      );
    } catch (error) {
      digest = (error as Error & { digest?: string }).digest ?? "";
    }
    expect(digest).toContain(
      "NEXT_REDIRECT;303;/admin?error=invite_not_found;",
    );
  });

  it("redirects to /admin?error=invalid_resend when inviteId is missing", async () => {
    const action = await importResendInviteAction();
    let digest = "";
    try {
      await action(buildFormData({ _csrf: "csrf-admin-1" }));
    } catch (error) {
      digest = (error as Error & { digest?: string }).digest ?? "";
    }
    expect(digest).toContain("NEXT_REDIRECT;303;/admin?error=invalid_resend;");
  });
});
