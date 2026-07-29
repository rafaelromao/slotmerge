import { requirePageContext } from "../../../src/lib/page-context";
import { createAdminUsersWorkflow } from "../../../src/workflow/admin-users";
import { createPostgresAdminUserRepository } from "../../../src/admin/users.repository";
import { createPostgresInviteRepository } from "../../../src/admin/invites.repository";
import { getSessionRepository } from "../../../src/auth/session";
import { systemClock } from "../../../src/system/clock";
import { createAdminTopicsWorkflow } from "../../../src/admin/topics.workflow";
import { createAdminStatusWorkflow } from "../../../src/admin/operational-status.workflow";
import {
  changeRoleAction,
  inviteUserAction,
  reinstateAction,
  resendInviteAction,
  suspendAction,
} from "./_actions/users";
import {
  approveProposalAction,
  rejectProposalAction,
  retireTopicAction,
} from "./_actions/topics";
import { SuspendTypedConfirm } from "./_components/SuspendTypedConfirm";
import { RetireTypedConfirm } from "./_components/RetireTypedConfirm";
import { SectionDeepLink } from "./_components/SectionDeepLink";
import { AdminStatusSection } from "./_components/AdminStatusSection";
import type { UserListItem } from "../../../src/admin/users.repository";
import type { UserRole, UserStatus } from "../../../src/db/schema";
import type { AdminUsersRecentInvite } from "../../../src/workflow/admin-users";
import type {
  AdminTopicListItem,
  AdminTopicProposalListItem,
} from "../../../src/topics/repository";

type SearchParams = Promise<{
  invited?: string | string[];
  error?: string | string[];
  csrf?: string | string[];
  role_change?: string | string[];
  action?: string | string[];
}>;

type InviteEffectiveStatus = "pending" | "accepted" | "revoked" | "expired";

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

  if (!usersResult.ok) {
    throw new Error("Admin users load failed");
  }

  const users = usersResult.value;

  const params = (await searchParams) ?? {};
  const invitedEmail = firstString(params.invited);
  const errorCode = firstString(params.error);

  const activeTopicCount = topicsResult.activeTopics.length;
  const calendarConnectionCount =
    statusResult.calendar.counts.connected +
    statusResult.calendar.counts.pending;
  const recentEmailFailures = statusResult.email.counts.failed;
  const suspendedCount = users.users.filter(
    (u) => u.status === "suspended",
  ).length;
  const activeUsersCount = users.users.length - suspendedCount;

  return (
    <main className="app-container admin-page">
      <header className="admin-page-header">
        <div className="admin-page-header-copy">
          <p className="eyebrow">Administration</p>
          <h1>Admin</h1>
          <p className="page-description">
            Invite Users, curate Topics, and monitor the system. Self-action
            protection is enforced on every destructive control.
          </p>
        </div>
        <nav
          className="admin-nav-pills"
          aria-label="Admin sections"
          data-testid="admin-nav-pills"
        >
          <a href="#users">Users</a>
          <a href="#topics">Topics</a>
          <a href="#status">Status</a>
        </nav>
      </header>
      <SectionDeepLink
        sections={[
          { id: "users", targetIds: ["users", "invites"] },
          { id: "topics", targetIds: ["topics", "topic-proposals"] },
          { id: "status" },
        ]}
      />

      {invitedEmail ||
      errorCode ||
      firstString(params.csrf) === "failed" ||
      firstString(params.role_change) === "saved" ||
      firstString(params.action) === "suspended" ||
      firstString(params.action) === "topic_approved" ||
      firstString(params.action) === "topic_rejected" ||
      firstString(params.action) === "topic_retired" ||
      firstString(params.action) === "reinstated" ||
      firstString(params.action) === "refresh_ok" ||
      firstString(params.action) === "refresh_err" ||
      firstString(params.action) === "disconnect_ok" ||
      firstString(params.action) === "disconnect_err" ? (
        <div className="admin-banner-row">
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

          {firstString(params.csrf) === "failed" ? (
            <p
              className="admin-error-banner"
              role="alert"
              aria-live="polite"
              data-testid="admin-csrf-banner"
            >
              Your session token was invalid. Refresh and try again.
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

          {firstString(params.action) === "topic_approved" ? (
            <p
              className="admin-info-banner"
              role="status"
              aria-live="polite"
              data-testid="admin-topic-approved-banner"
            >
              Topic proposal approved and added to the catalogue.
            </p>
          ) : null}

          {firstString(params.action) === "topic_rejected" ? (
            <p
              className="admin-info-banner"
              role="status"
              aria-live="polite"
              data-testid="admin-topic-rejected-banner"
            >
              Topic proposal rejected.
            </p>
          ) : null}

          {firstString(params.action) === "topic_retired" ? (
            <p
              className="admin-info-banner"
              role="status"
              aria-live="polite"
              data-testid="admin-topic-retired-banner"
            >
              Topic retired. Historical associations preserved.
            </p>
          ) : null}

          {firstString(params.action) === "reinstated" ? (
            <p
              className="admin-info-banner"
              role="status"
              aria-live="polite"
              data-testid="admin-reinstate-banner"
            >
              User reinstated.
            </p>
          ) : null}

          {(() => {
            const actionValue = firstString(params.action);
            if (
              actionValue === "refresh_ok" ||
              actionValue === "refresh_err" ||
              actionValue === "disconnect_ok" ||
              actionValue === "disconnect_err"
            ) {
              const isError = actionValue.endsWith("_err");
              const intent = actionValue.startsWith("refresh_")
                ? "Refresh"
                : "Disconnect";
              const message = isError
                ? `${intent} failed. Refresh and try again.`
                : `${intent} succeeded.`;
              return (
                <p
                  className={
                    isError ? "admin-error-banner" : "admin-info-banner"
                  }
                  role={isError ? "alert" : "status"}
                  aria-live={isError ? "assertive" : "polite"}
                  data-testid="admin-status-action-banner"
                  data-outcome={isError ? "error" : "success"}
                >
                  {message}
                </p>
              );
            }
            return null;
          })()}
        </div>
      ) : null}

      <details id="users" className="admin-section" open>
        <summary
          className="admin-section-summary"
          data-testid="admin-users-summary"
        >
          <h2 className="admin-section-heading">Users</h2>
          <span className="admin-section-summary-line">
            <span className="admin-section-summary-pill">
              {activeUsersCount} active
            </span>
            {suspendedCount > 0 ? (
              <span className="admin-section-summary-pill" data-tone="danger">
                {suspendedCount} suspended
              </span>
            ) : null}
            <span>· {users.users.length} total</span>
          </span>
        </summary>
        <div className="admin-section-body" data-testid="admin-users-body">
          <div className="invite-card">
            <div className="invite-card-header">
              <h3>Invite a teammate</h3>
              <p>
                Invitations are magic-link emails. Role can be changed later.
              </p>
            </div>
            <form
              id="invite-form"
              className="invite-form"
              data-testid="invite-form"
              action={inviteUserAction}
            >
              <input type="hidden" name="_csrf" value={context.csrfToken} />
              <div className="invite-form-field">
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
              </div>
              <div className="invite-form-field">
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
              </div>
              <button
                type="submit"
                className="btn btn-primary invite-form-submit"
                data-testid="invite-submit"
              >
                Send invite
              </button>
            </form>
          </div>

          <div className="users-card">
            <div className="users-card-header">
              <h3>Members</h3>
              <p>{users.users.length} on the team.</p>
            </div>
            <div className="users-table-wrap">
              <table className="users-table" data-testid="users-table">
                <thead>
                  <tr>
                    <th scope="col">Email</th>
                    <th scope="col">Role</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="users-actions-heading">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.users.map((u) => (
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
          </div>

          {users.users.length === 0 ? (
            <div
              className="empty-state"
              role="status"
              data-testid="users-empty-state"
            >
              <p className="empty-state-title">No users yet</p>
              <p className="empty-state-message">
                Invite a teammate to grant them access. The invitee receives an
                email with a single-use magic link.
              </p>
              <a
                className="btn btn-primary"
                href="#invite-form"
                data-testid="users-empty-state-cta"
              >
                Invite a user
              </a>
            </div>
          ) : null}

          <section className="recent-invites" data-testid="recent-invites">
            <h3 className="recent-invites-heading">Recent invites</h3>
            {users.recentInvites.length === 0 ? (
              <p
                className="recent-invites-empty"
                data-testid="recent-invites-empty"
              >
                No invites yet.
              </p>
            ) : (
              <div className="recent-invites-table-wrap">
                <table className="recent-invites-table">
                  <thead>
                    <tr>
                      <th scope="col">Email</th>
                      <th scope="col">Role</th>
                      <th scope="col">Status</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.recentInvites.map((invite) => (
                      <InviteRow
                        key={invite.id}
                        invite={invite}
                        csrfToken={context.csrfToken}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </details>

      <details id="topics" className="admin-section">
        <summary
          className="admin-section-summary"
          data-testid="admin-topics-summary"
        >
          <h2 className="admin-section-heading">Topics</h2>
          <span className="admin-section-summary-line">
            <span className="admin-section-summary-pill">
              {activeTopicCount} active
            </span>
            {topicsResult.pendingCount > 0 ? (
              <span className="admin-section-summary-pill" data-tone="warning">
                {topicsResult.pendingCount} pending
              </span>
            ) : null}
          </span>
        </summary>
        <div className="admin-section-body" data-testid="admin-topics-body">
          <PendingTopicProposals
            pendingProposals={topicsResult.pendingProposals}
            csrfToken={context.csrfToken}
          />
          <ActiveTopics
            activeTopics={topicsResult.activeTopics}
            actorId={context.user.id}
            csrfToken={context.csrfToken}
          />
        </div>
      </details>

      <details id="status" className="admin-section">
        <summary
          className="admin-section-summary"
          data-testid="admin-status-summary"
        >
          <h2 className="admin-section-heading">Status</h2>
          <span className="admin-section-summary-line">
            <span
              className="admin-section-summary-pill"
              data-tone={
                statusResult.health.email === "red" ||
                statusResult.health.calendar === "red" ||
                statusResult.health.tokens === "red"
                  ? "danger"
                  : statusResult.health.email === "amber" ||
                      statusResult.health.calendar === "amber" ||
                      statusResult.health.tokens === "amber"
                    ? "warning"
                    : "ok"
              }
              data-testid="admin-section-status-tone"
            >
              {recentEmailFailures === 0 &&
              statusResult.calendar.tokensNeedingRefresh.length === 0
                ? "All systems healthy"
                : "Needs attention"}
            </span>
            <span>
              {recentEmailFailures} email failure
              {recentEmailFailures === 1 ? "" : "s"} · {calendarConnectionCount}{" "}
              calendar connection
              {calendarConnectionCount === 1 ? "" : "s"}
            </span>
          </span>
        </summary>
        <div
          className="admin-section-body"
          data-testid="admin-status-section-body"
        >
          <AdminStatusSection
            statusResult={statusResult}
            csrfToken={context.csrfToken}
          />
        </div>
      </details>
    </main>
  );
}

function firstString(
  value: string | string[] | null | undefined,
): string | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : null;
  }
  return typeof value === "string" ? value : null;
}

function errorMessageFor(code: string): string {
  switch (code) {
    case "self_invite":
      return "You cannot invite yourself.";
    case "email_already_invited":
      return "An invite already exists or the email belongs to an existing User.";
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
      return "We could not suspend the user. Please try again.";
    case "self_reinstate":
      return "You cannot reinstate yourself.";
    case "user_already_active":
      return "That user is already active.";
    case "invalid_reinstate":
      return "Choose a valid user to reinstate.";
    case "reinstate_failed":
      return "We could not reinstate the user. Please try again.";
    case "invite_not_found":
      return "That invite no longer exists.";
    case "invalid_resend":
      return "Choose a valid invite to resend.";
    case "resend_failed":
      return "We could not resend the invite. Please try again.";
    case "topic_proposal_invalid":
      return "Choose a valid Topic Proposal to decide on.";
    case "topic_invalid_topic":
      return "Choose a valid Topic to retire.";
    case "topic_proposal_not_found":
      return "That Topic Proposal no longer exists.";
    case "topic_proposal_already_decided":
      return "That Topic Proposal has already been decided.";
    case "topic_cannot_retire_own_proposal":
      return "You cannot retire a Topic you proposed.";
    case "topic_not_found":
      return "That Topic no longer exists.";
    case "topic_already_retired":
      return "That Topic is already retired.";
    case "topic_confirm_name_required":
      return "Type the Topic's name to confirm retirement.";
    case "topic_confirm_name_mismatch":
      return "The typed name does not match the Topic. Type the Topic's exact name to confirm.";
    case "topic_error_unknown":
    default:
      return "We could not complete that Topics action. Please try again.";
  }
}

function labelUserStatus(status: UserStatus): string {
  return status === "active" ? "Active" : "Suspended";
}

function labelUserRole(role: UserRole): string {
  return role === "user"
    ? "User"
    : role === "organizer"
      ? "Organizer"
      : "Admin";
}

function labelInviteStatus(status: InviteEffectiveStatus): string {
  if (status === "pending") return "Pending";
  if (status === "accepted") return "Accepted";
  if (status === "revoked") return "Revoked";
  return "Expired";
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
  const isSuspended = user.status === "suspended";
  return (
    <tr
      data-testid={`users-row-${user.id}`}
      data-self={isSelf ? "true" : "false"}
    >
      <td className="users-email-cell">{user.email}</td>
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
            className="users-role-select"
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
      <td className="users-status-cell" data-testid={`users-status-${user.id}`}>
        <span
          className="users-status-pill"
          data-status={isSuspended ? "suspended" : "active"}
        >
          {labelUserStatus(user.status)}
        </span>
      </td>
      <td className="users-actions-cell">
        {isSelf ? (
          <span
            className="users-self-actions"
            role="note"
            data-testid={`users-self-actions-${user.id}`}
          >
            You cannot suspend or reinstate yourself.
          </span>
        ) : isSuspended ? (
          <form
            className="users-reinstate-form"
            data-testid={`users-reinstate-form-${user.id}`}
            action={reinstateAction}
          >
            <input type="hidden" name="_csrf" value={csrfToken} />
            <input type="hidden" name="userId" value={user.id} />
            <button
              type="submit"
              className="btn btn-secondary users-reinstate-button"
              data-testid={`users-reinstate-button-${user.id}`}
            >
              Reinstate
            </button>
          </form>
        ) : (
          <SuspendTypedConfirm
            userId={user.id}
            userEmail={user.email}
            csrfToken={csrfToken}
            action={suspendAction}
          />
        )}
      </td>
    </tr>
  );
}

function InviteRow({
  invite,
  csrfToken,
}: {
  invite: AdminUsersRecentInvite;
  csrfToken: string;
}) {
  const isResendable = invite.effectiveStatus === "pending";
  const actionLabel = isResendable ? "Resend" : "Re-invite";
  return (
    <tr data-testid={`recent-invites-row-${invite.id}`}>
      <td className="users-email-cell">{invite.email}</td>
      <td>{labelUserRole(invite.role)}</td>
      <td data-testid={`recent-invites-status-${invite.id}`}>
        <span
          className="recent-invites-status"
          data-status={invite.effectiveStatus}
        >
          {labelInviteStatus(invite.effectiveStatus)}
        </span>
      </td>
      <td>
        <div className="recent-invites-action">
          <form
            data-testid={`recent-invites-action-${invite.id}`}
            action={resendInviteAction}
          >
            <input type="hidden" name="_csrf" value={csrfToken} />
            <input type="hidden" name="inviteId" value={invite.id} />
            <button
              type="submit"
              className="btn btn-secondary"
              data-testid={`recent-invites-button-${invite.id}`}
            >
              {actionLabel}
            </button>
          </form>
        </div>
      </td>
    </tr>
  );
}

function PendingTopicProposals({
  pendingProposals,
  csrfToken,
}: {
  pendingProposals: AdminTopicProposalListItem[];
  csrfToken: string;
}) {
  return (
    <section
      className="topics-admin-section pending-topic-proposals"
      data-testid="pending-topic-proposals"
    >
      <div className="topics-admin-section-header">
        <h3>Pending Topic Proposals</h3>
        <p>{pendingProposals.length} awaiting review.</p>
      </div>
      {pendingProposals.length === 0 ? (
        <p className="empty-state" data-testid="topics-pending-empty">
          No pending Topic Proposals.
        </p>
      ) : (
        <div className="pending-topic-proposals-table-wrap">
          <table
            className="pending-topic-proposals-table"
            data-testid="pending-topic-proposals-table"
          >
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Proposing User</th>
                <th scope="col">Date</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingProposals.map((proposal) => (
                <PendingProposalRow
                  key={proposal.id}
                  proposal={proposal}
                  csrfToken={csrfToken}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PendingProposalRow({
  proposal,
  csrfToken,
}: {
  proposal: AdminTopicProposalListItem;
  csrfToken: string;
}) {
  return (
    <tr data-testid={`topics-proposal-row-${proposal.id}`}>
      <td className="users-email-cell">{proposal.candidateName}</td>
      <td>{proposal.proposedByUserEmail ?? "(deleted User)"}</td>
      <td>{formatProposalDate(proposal.createdAt)}</td>
      <td className="actions-cell">
        <div className="topics-proposal-actions">
          <form
            className="topics-proposal-approve-form"
            data-testid={`topics-approve-form-${proposal.id}`}
            action={approveProposalAction}
          >
            <input type="hidden" name="_csrf" value={csrfToken} />
            <input type="hidden" name="proposalId" value={proposal.id} />
            <button
              type="submit"
              className="btn btn-primary"
              data-testid={`topics-approve-${proposal.id}`}
            >
              Approve
            </button>
          </form>
          <form
            className="topics-proposal-reject-form"
            data-testid={`topics-reject-form-${proposal.id}`}
            action={rejectProposalAction}
          >
            <input type="hidden" name="_csrf" value={csrfToken} />
            <input type="hidden" name="proposalId" value={proposal.id} />
            <button
              type="submit"
              className="btn btn-secondary"
              data-testid={`topics-reject-${proposal.id}`}
            >
              Reject
            </button>
          </form>
        </div>
      </td>
    </tr>
  );
}

function ActiveTopics({
  activeTopics,
  actorId,
  csrfToken,
}: {
  activeTopics: AdminTopicListItem[];
  actorId: string;
  csrfToken: string;
}) {
  return (
    <section
      className="topics-admin-section active-topics"
      data-testid="active-topics"
    >
      <div className="topics-admin-section-header">
        <h3>Active Topics</h3>
        <p>{activeTopics.length} in the catalogue.</p>
      </div>
      {activeTopics.length === 0 ? (
        <p className="empty-state" data-testid="topics-active-empty">
          No active Topics.
        </p>
      ) : (
        <div className="active-topics-table-wrap">
          <table
            className="active-topics-table"
            data-testid="active-topics-table"
          >
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeTopics.map((topic) => (
                <tr
                  key={topic.id}
                  data-testid={`topics-active-row-${topic.id}`}
                  data-self-action={
                    topic.proposedByUserId === actorId ? "true" : "false"
                  }
                >
                  <td className="users-email-cell">{topic.name}</td>
                  <td className="actions-cell">
                    <RetireTypedConfirm
                      topicId={topic.id}
                      topicName={topic.name}
                      csrfToken={csrfToken}
                      disabledBySelfAction={topic.proposedByUserId === actorId}
                      action={retireTopicAction}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatProposalDate(date: Date): string {
  try {
    return date.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}
