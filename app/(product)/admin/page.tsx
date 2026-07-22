import { requirePageContext } from "../../../src/lib/page-context";
import { createAdminUsersWorkflow } from "../../../src/admin/users.workflow";
import { createPostgresAdminUserRepository } from "../../../src/admin/users.repository";
import { createPostgresInviteRepository } from "../../../src/admin/invites.repository";
import { getSessionRepository } from "../../../src/auth/session";
import { systemClock } from "../../../src/system/clock";
import { createAdminTopicsWorkflow } from "../../../src/admin/topics.workflow";
import { createAdminStatusWorkflow } from "../../../src/admin/operational-status.workflow";
import {
  changeRoleAction,
  inviteUserAction,
  suspendAction,
} from "./_actions/users";
import { SuspendTypedConfirm } from "./_components/SuspendTypedConfirm";
import type { UserListItem } from "../../../src/admin/users.repository";
import type { UserStatus } from "../../../src/db/schema";

type SearchParams = Promise<{
  invited?: string | string[];
  error?: string | string[];
  role_change?: string | string[];
  action?: string | string[];
}>;

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: SearchParams;
} = {}) {
  const context = await requirePageContext({ roles: ["admin"] });

  const workflow = createAdminUsersWorkflow({
    userRepository: createPostgresAdminUserRepository(),
    inviteRepository: createPostgresInviteRepository(),
    sessionRepository: getSessionRepository(),
    clock: systemClock(),
  });

  const topicsWorkflow = createAdminTopicsWorkflow({
    clock: systemClock(),
  });

  const statusWorkflow = createAdminStatusWorkflow({
    clock: systemClock(),
  });

  const [usersResult, topicsResult, statusResult] = await Promise.all([
    workflow.load(),
    topicsWorkflow.load(),
    statusWorkflow.load(),
  ]);

  const params = (await searchParams) ?? {};
  const invitedEmail = firstString(params.invited);
  const errorCode = firstString(params.error);

  const activeTopicCount = topicsResult.activeTopics.length;
  const calendarConnectionCount =
    statusResult.calendar.counts.connected +
    statusResult.calendar.counts.pending;
  const recentEmailFailures = statusResult.email.counts.failed;

  return (
    <main className="app-container">
      <h1>Admin</h1>

      {invitedEmail ? (
        <p
          className="invite-banner"
          role="status"
          aria-live="polite"
          data-testid="invite-banner"
        >
          Invitation sent to {invitedEmail}.
        </p>
      ) : null}

      {errorCode ? (
        <p
          className="admin-error-banner"
          role="alert"
          aria-live="polite"
          data-testid="admin-error-banner"
        >
          {errorMessageFor(errorCode)}
        </p>
      ) : null}

      {firstString(params.role_change) === "saved" ? (
        <p
          className="admin-info-banner"
          role="status"
          aria-live="polite"
          data-testid="admin-role-change-banner"
        >
          Role updated.
        </p>
      ) : null}

      {firstString(params.action) === "suspended" ? (
        <p
          className="admin-info-banner"
          role="status"
          aria-live="polite"
          data-testid="admin-suspend-banner"
        >
          User suspended and active sessions revoked.
        </p>
      ) : null}

      <details className="admin-section" open>
        <summary
          className="admin-section-summary"
          data-testid="admin-users-summary"
        >
          <h2 className="admin-section-heading">Users</h2>
          <span className="admin-section-summary-line">
            {usersResult.users.length} user
            {usersResult.users.length === 1 ? "" : "s"}
          </span>
        </summary>
        <div className="admin-section-body" data-testid="admin-users-body">
          <form
            className="invite-form"
            data-testid="invite-form"
            action={inviteUserAction}
          >
            <input type="hidden" name="_csrf" value={context.csrfToken} />
            <label className="invite-form-label" htmlFor="invite-email">
              Email
            </label>
            <input
              id="invite-email"
              name="email"
              type="email"
              required
              className="invite-form-input"
              data-testid="invite-email"
              placeholder="newuser@example.com"
            />
            <label className="invite-form-label" htmlFor="invite-role">
              Role
            </label>
            <select
              id="invite-role"
              name="role"
              className="invite-form-select"
              data-testid="invite-role"
              defaultValue="user"
            >
              <option value="user">User</option>
              <option value="organizer">Organizer</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              className="btn btn-primary invite-form-submit"
              data-testid="invite-submit"
            >
              Send invite
            </button>
          </form>

          <table className="users-table" data-testid="users-table">
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {usersResult.users.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  isSelf={u.id === context.user.id}
                  csrfToken={context.csrfToken}
                />
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <details className="admin-section">
        <summary
          className="admin-section-summary"
          data-testid="admin-topics-summary"
        >
          <h2 className="admin-section-heading">Topics</h2>
          <span className="admin-section-summary-line">
            {activeTopicCount} active topic{activeTopicCount === 1 ? "" : "s"}
          </span>
        </summary>
        <div className="admin-section-body" data-testid="admin-topics-body">
          <p>Topics section is a placeholder for T17.</p>
        </div>
      </details>

      <details className="admin-section">
        <summary
          className="admin-section-summary"
          data-testid="admin-status-summary"
        >
          <h2 className="admin-section-heading">Status</h2>
          <span className="admin-section-summary-line">
            {recentEmailFailures} email failures in the last{" "}
            {statusResult.windowHours}h · {calendarConnectionCount} calendar
            connection{calendarConnectionCount === 1 ? "" : "s"}
          </span>
        </summary>
        <div className="admin-section-body" data-testid="admin-status-body">
          <p>Status section is a placeholder for T18.</p>
        </div>
      </details>
    </main>
  );
}

function firstString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function errorMessageFor(code: string): string {
  switch (code) {
    case "self_invite":
      return "You cannot invite yourself.";
    case "email_already_invited":
      return "An invite or account already exists for that email.";
    case "invalid_invite":
      return "Enter a valid email and role.";
    case "self_role_change":
      return "You cannot change your own role.";
    case "user_not_found":
      return "That user no longer exists.";
    case "invalid_role_change":
      return "Choose a valid user and role.";
    case "role_change_failed":
      return "We could not update the role. Please try again.";
    case "self_suspend":
      return "You cannot suspend yourself.";
    case "user_already_suspended":
      return "That user is already suspended.";
    case "invalid_suspend":
      return "Type the user's email to confirm.";
    case "suspend_failed":
    default:
      return "We could not suspend the user. Please try again.";
  }
}

function labelUserStatus(status: UserStatus): string {
  return status === "active" ? "Active" : "Suspended";
}

function UserRow({
  user,
  isSelf,
  csrfToken,
}: {
  user: UserListItem;
  isSelf: boolean;
  csrfToken: string;
}) {
  const selectId = `role-select-${user.id}`;
  const selfHelpId = `role-self-help-${user.id}`;
  return (
    <tr
      data-testid={`users-row-${user.id}`}
      data-self={isSelf ? "true" : "false"}
    >
      <td>{user.email}</td>
      <td>
        <form
          className="users-role-form"
          data-testid={`users-role-form-${user.id}`}
          action={changeRoleAction}
        >
          <input type="hidden" name="_csrf" value={csrfToken} />
          <input type="hidden" name="userId" value={user.id} />
          <label className="visually-hidden" htmlFor={selectId}>
            Role for {user.email}
          </label>
          <select
            id={selectId}
            name="role"
            defaultValue={user.role}
            disabled={isSelf}
            data-testid={`users-role-select-${user.id}`}
            aria-describedby={isSelf ? selfHelpId : undefined}
          >
            <option value="user">User</option>
            <option value="organizer">Organizer</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="submit"
            className="btn btn-secondary users-role-save"
            data-testid={`users-role-save-${user.id}`}
            disabled={isSelf}
            aria-describedby={isSelf ? selfHelpId : undefined}
          >
            Save
          </button>
          {isSelf ? (
            <span id={selfHelpId} className="users-self-help" role="note">
              You cannot change your own role.
            </span>
          ) : null}
        </form>
      </td>
      <td data-testid={`users-status-${user.id}`}>
        {labelUserStatus(user.status)}
      </td>
      <td>
        {user.status === "active" ? (
          <SuspendTypedConfirm
            userId={user.id}
            userEmail={user.email}
            csrfToken={csrfToken}
            action={suspendAction}
          />
        ) : (
          <span className="users-row-placeholder">
            Suspended — reinstate lands in slice 5.
          </span>
        )}
      </td>
    </tr>
  );
}
