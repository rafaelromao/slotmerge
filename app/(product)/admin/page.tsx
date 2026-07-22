import { requirePageContext } from "../../../src/lib/page-context";
import { createAdminUsersWorkflow } from "../../../src/admin/users.workflow";
import { createPostgresAdminUserRepository } from "../../../src/admin/users.repository";
import { createPostgresInviteRepository } from "../../../src/admin/invites.repository";
import { getSessionRepository } from "../../../src/auth/session";
import { systemClock } from "../../../src/system/clock";
import { createAdminTopicsWorkflow } from "../../../src/admin/topics.workflow";
import { createAdminStatusWorkflow } from "../../../src/admin/operational-status.workflow";

type SearchParams = Promise<{
  invited?: string | string[];
}>;

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: SearchParams;
} = {}) {
  await requirePageContext({ roles: ["admin"] });

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

      <details className="admin-section" open>
        <summary
          className="admin-section-summary"
          data-testid="admin-users-summary"
        >
          <h2 className="admin-section-heading">Users</h2>
        </summary>
        <div className="admin-section-body" data-testid="admin-users-body">
          <p data-testid="admin-users-count">
            {usersResult.users.length} user
            {usersResult.users.length === 1 ? "" : "s"} on the platform.
          </p>
          <p>
            Invite, change roles, suspend, and reinstate team members from this
            section.
          </p>
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
