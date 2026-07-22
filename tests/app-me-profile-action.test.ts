import { afterEach, describe, expect, it, vi } from "vitest";

type ActionModule = {
  buildUpdateProfileAction: (
    deps?: unknown,
  ) => (formData: FormData) => Promise<UpdateProfileActionState>;
  __resetUpdateProfileActionDepsForTests: () => void;
};

type UpdateProfileActionState = {
  ok: "idle" | "success" | "error";
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

async function loadActionModule(): Promise<ActionModule> {
  return (await import(
    "../src/profile/update-profile-action"
  )) as ActionModule;
}

function makeFormData(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) {
    fd.set(key, value);
  }
  return fd;
}

const baseUserContext = {
  userId: "user-1",
  csrfToken: "csrf-token-1",
  isAuthed: true as const,
  isAdmin: false,
  isOrganizerOrAdmin: false,
  user: { id: "user-1" } as never,
};

function makeWorkflow(
  updateResult?: { ok: true; value: never } | { ok: false; error: { fieldErrors: Record<string, string> } },
) {
  return {
    loadMe: () => Promise.resolve({ ok: true, value: {} as never }),
    updateProfile: vi.fn().mockImplementation(() => {
      return Promise.resolve(
        updateResult ?? { ok: true, value: {} as never },
      );
    }),
  };
}

describe("updateProfileAction (Server Action)", () => {
  afterEach(async () => {
    const mod = await loadActionModule();
    mod.__resetUpdateProfileActionDepsForTests();
  });

  it("returns ok=success with empty fieldErrors when the workflow accepts the patch", async () => {
    const mod = await loadActionModule();
    const workflow = makeWorkflow();
    const action = mod.buildUpdateProfileAction({
      getUserContext: () => Promise.resolve(baseUserContext),
      workflow: workflow as never,
    });

    const result = await action(
      makeFormData({
        _csrf: "csrf-token-1",
        displayName: "Grace Hopper",
        profileTimezone: "America/New_York",
        bufferMinutes: "30",
        avatarUrl: "https://example.com/grace.png",
        shortBio: "Compiler pioneer",
      }),
    );

    expect(result.ok).toBe("success");
    expect(result.fieldErrors ?? {}).toEqual({});
    expect(workflow.updateProfile).toHaveBeenCalledWith({
      userId: "user-1",
      patch: {
        displayName: "Grace Hopper",
        profileTimezone: "America/New_York",
        bufferMinutes: 30,
        avatarUrl: "https://example.com/grace.png",
        shortBio: "Compiler pioneer",
      },
    });
  });

  it("returns ok=error with fieldErrors when the workflow rejects the patch", async () => {
    const mod = await loadActionModule();
    const fieldErrors = {
      displayName: "Display name is required and must be at least 1 character.",
    };
    const workflow = makeWorkflow({ ok: false, error: { fieldErrors } });
    const action = mod.buildUpdateProfileAction({
      getUserContext: () => Promise.resolve(baseUserContext),
      workflow: workflow as never,
    });

    const result = await action(
      makeFormData({
        _csrf: "csrf-token-1",
        displayName: "   ",
        profileTimezone: "America/New_York",
        bufferMinutes: "30",
        avatarUrl: "",
        shortBio: "",
      }),
    );

    expect(result.ok).toBe("error");
    expect(result.fieldErrors?.displayName).toBe(
      "Display name is required and must be at least 1 character.",
    );
    expect(result.values?.displayName).toBe("   ");
    expect(result.values?.profileTimezone).toBe("America/New_York");
  });

  it("preserves empty-string avatar/bio as null in the patch", async () => {
    const mod = await loadActionModule();
    const workflow = makeWorkflow();
    const action = mod.buildUpdateProfileAction({
      getUserContext: () => Promise.resolve(baseUserContext),
      workflow: workflow as never,
    });

    await action(
      makeFormData({
        _csrf: "csrf-token-1",
        displayName: "Grace Hopper",
        profileTimezone: "America/New_York",
        bufferMinutes: "30",
        avatarUrl: "",
        shortBio: "",
      }),
    );

    expect(workflow.updateProfile).toHaveBeenCalledWith({
      userId: "user-1",
      patch: {
        displayName: "Grace Hopper",
        profileTimezone: "America/New_York",
        bufferMinutes: 30,
        avatarUrl: null,
        shortBio: null,
      },
    });
  });

  it("throws when the CSRF token is missing", async () => {
    const mod = await loadActionModule();
    const workflow = makeWorkflow();
    const action = mod.buildUpdateProfileAction({
      getUserContext: () => Promise.resolve(baseUserContext),
      workflow: workflow as never,
    });

    await expect(
      action(
        makeFormData({
          displayName: "Grace Hopper",
          profileTimezone: "America/New_York",
          bufferMinutes: "30",
        }),
      ),
    ).rejects.toThrow();
    expect(workflow.updateProfile).not.toHaveBeenCalled();
  });

  it("throws when the CSRF token does not match the session token", async () => {
    const mod = await loadActionModule();
    const workflow = makeWorkflow();
    const action = mod.buildUpdateProfileAction({
      getUserContext: () => Promise.resolve(baseUserContext),
      workflow: workflow as never,
    });

    await expect(
      action(
        makeFormData({
          _csrf: "wrong-token",
          displayName: "Grace Hopper",
          profileTimezone: "America/New_York",
          bufferMinutes: "30",
        }),
      ),
    ).rejects.toThrow();
    expect(workflow.updateProfile).not.toHaveBeenCalled();
  });

  it("coerces non-numeric buffer minutes to NaN and preserves raw input on validation error", async () => {
    const mod = await loadActionModule();
    const workflow = makeWorkflow({
      ok: false,
      error: { fieldErrors: { bufferMinutes: "Buffer minutes required." } },
    });
    const action = mod.buildUpdateProfileAction({
      getUserContext: () => Promise.resolve(baseUserContext),
      workflow: workflow as never,
    });

    const result = await action(
      makeFormData({
        _csrf: "csrf-token-1",
        displayName: "Grace Hopper",
        profileTimezone: "America/New_York",
        bufferMinutes: "not-a-number",
        avatarUrl: "",
        shortBio: "",
      }),
    );

    expect(result.ok).toBe("error");
    expect(result.values?.bufferMinutes).toBe("not-a-number");
    expect(workflow.updateProfile).toHaveBeenCalledWith({
      userId: "user-1",
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      patch: expect.objectContaining({ bufferMinutes: NaN }),
    });
  });
});
