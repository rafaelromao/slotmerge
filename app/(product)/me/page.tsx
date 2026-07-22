import Link from "next/link";

import { requirePageContext } from "../../../src/lib/page-context";
import { createProfileWorkflow } from "../../../src/profile/profile-workflow";

export default async function ProfileOverviewPage() {
  const context = await requirePageContext({
    roles: ["user", "organizer", "admin"],
  });

  const workflow = createProfileWorkflow();
  const result = await workflow.loadMe({ userId: context.user.id });

  if (!result.ok) {
    return (
      <main className="app-container">
        <div className="empty-state" data-testid="me-overview-empty">
          <p className="empty-state-title">Profile not found</p>
          <p>
            We could not load your profile. Please refresh, or contact support if
            the problem persists.
          </p>
        </div>
      </main>
    );
  }

  const profile = result.value;
  const displayName = profile.displayName?.trim() || profile.email;

  return (
    <main className="app-container">
      <h1>My Profile</h1>
      <p>
        Update your display name, timezone, and preferences so other members can
        find you in searches.
      </p>

      <section
        className="profile-summary"
        aria-labelledby="profile-summary-heading"
        data-testid="profile-summary"
      >
        <h2 id="profile-summary-heading">Profile summary</h2>
        <dl className="profile-summary-list">
          <div className="profile-summary-row">
            <dt>Display name</dt>
            <dd data-testid="profile-summary-display-name">{displayName}</dd>
          </div>
          <div className="profile-summary-row">
            <dt>Email</dt>
            <dd data-testid="profile-summary-email">{profile.email}</dd>
          </div>
          <div className="profile-summary-row">
            <dt>Timezone</dt>
            <dd data-testid="profile-summary-timezone">
              {profile.profileTimezone ?? "Not set"}
            </dd>
          </div>
          <div className="profile-summary-row">
            <dt>Buffer</dt>
            <dd data-testid="profile-summary-buffer">
              {profile.bufferMinutes} minutes
            </dd>
          </div>
        </dl>

        <Link
          href="/me/profile"
          className="btn btn-primary"
          data-testid="profile-summary-edit-link"
        >
          Edit profile
        </Link>
      </section>
    </main>
  );
}
