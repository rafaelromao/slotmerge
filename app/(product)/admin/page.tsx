import { requirePageContext } from "../../../src/lib/page-context";
import { createAdminUsersWorkflow } from "../../../src/admin/users.workflow";
import { createPostgresAdminUserRepository } from "../../../src/admin/users.repository";
import { createPostgresInviteRepository } from "../../../src/admin/invites.repository";
import { getSessionRepository } from "../../../src/auth/session";
import { systemClock } from "../../../src/system/clock";
import { createAdminTopicsWorkflow } from "../../../src/admin/topics.workflow";
import { createAdminStatusWorkflow } from "../../../src/admin/operational-status.workflow";
import { inviteUserAction } from "./_actions/users";

type SearchParams = Promise<{
  invited?: string | string[];
  error?: string | string[];
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
    case "invite_failed":
    default:
      return "We could not create the invitation. Please try again.";
  }
}
