import { describe, expect, it, vi } from "vitest";

import type { Session } from "../../../../src/auth/session";
import { ok } from "../../../../src/lib/result";
import type { AccountWorkflow } from "../../../../src/workflow/account";
import { createSelfDeleteActionHandler } from "./self-delete-handler";

const session: Session = {
  user: {
    id: "user-295",
    email: "delete@example.com",
    displayName: "Delete User",
    avatarUrl: null,
    shortBio: null,
    role: "user",
    status: "active",
    profileTimezone: "UTC",
    bufferMinutes: 0,
  },
  csrfToken: "csrf-295",
};

function requestWith(
  form: Record<string, string>,
  origin = "http://localhost",
) {
  return new Request("http://localhost/me/delete/submit", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin,
    },
    body: new URLSearchParams(form),
  });
}

function createAction(
  selfDelete = vi.fn(() => Promise.resolve(ok(undefined))),
) {
  return {
    selfDelete,
    action: createSelfDeleteActionHandler({
      workflow: { selfDelete },
      loadSession: () => Promise.resolve(session),
      expectedOrigin: "http://localhost",
    }),
  };
}

describe("selfDeleteAction", () => {
  it("deletes the authenticated User and returns a 303 that clears the session cookie", async () => {
    const selfDelete = vi.fn(() => Promise.resolve(ok(undefined)));
    const workflow: AccountWorkflow = { selfDelete };
    const action = createSelfDeleteActionHandler({
      workflow,
      loadSession: () => Promise.resolve(session),
      expectedOrigin: "http://localhost",
    });

    const response = await action(
      requestWith({ _csrf: "csrf-295", confirmation: "DELETE" }),
    );

    expect(selfDelete).toHaveBeenCalledWith({ userId: "user-295" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/sign-in?reason=deleted",
    );
    expect(response.headers.get("set-cookie")).toContain("slotmerge_session=;");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it.each([
    ["", "confirm_required"],
    ["delete", "confirm_mismatch"],
    ["DELETE ", "confirm_mismatch"],
    [" DELETE", "confirm_mismatch"],
  ])(
    "rejects non-exact confirmation %j without deleting",
    async (confirmation, error) => {
      const { action, selfDelete } = createAction();

      const response = await action(
        requestWith({ _csrf: "csrf-295", confirmation }),
      );

      expect(selfDelete).not.toHaveBeenCalled();
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        `http://localhost/me/delete?error=${error}`,
      );
    },
  );

  it("rejects a wrong-origin request without deleting", async () => {
    const { action, selfDelete } = createAction();

    const response = await action(
      requestWith(
        { _csrf: "csrf-295", confirmation: "DELETE" },
        "https://attacker.example",
      ),
    );

    expect(selfDelete).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/me/delete?error=csrf",
    );
  });

  it("reports confirm_required when the confirmation field is missing", async () => {
    const { action, selfDelete } = createAction();

    const response = await action(requestWith({ _csrf: "csrf-295" }));

    expect(selfDelete).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "http://localhost/me/delete?error=confirm_required",
    );
  });

  it("redirects an unauthenticated request to sign-in without deleting", async () => {
    const selfDelete = vi.fn(() => Promise.resolve(ok(undefined)));
    const action = createSelfDeleteActionHandler({
      workflow: { selfDelete },
      loadSession: () => Promise.resolve(null),
      expectedOrigin: "http://localhost",
    });

    const response = await action(requestWith({}));

    expect(selfDelete).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/sign-in");
  });

  it("rejects an invalid CSRF token without deleting", async () => {
    const { action, selfDelete } = createAction();

    const response = await action(
      requestWith({ _csrf: "wrong-csrf", confirmation: "DELETE" }),
    );

    expect(selfDelete).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/me/delete?error=csrf",
    );
  });
});
