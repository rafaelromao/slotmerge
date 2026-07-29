import Link from "next/link";

import { requirePageContext } from "../../../src/lib/page-context";
import { createProfileWorkflow } from "../../../src/profile/profile-workflow";
import { systemClock } from "../../../src/system/clock";

export default async function ProfileOverviewPage() {
  const context = await requirePageContext({
    roles: ["user", "organizer", "admin"],
  });

  const workflow = createProfileWorkflow({ clock: systemClock() });
  const result = await workflow.loadMe({ userId: context.user.id });

  if (!result.ok) {
    return (
      <main className="app-container">
        <div className="empty-state" data-testid="me-overview-empty">
          <p className="empty-state-title">Profile not found</p>
          <p className="empty-state-description">
            We could not load your profile. Refresh, or contact support if the
            problem persists.
          </p>
        </div>
      </main>
    );
  }

  const profile = result.value;
  const displayName = profile.displayName?.trim() || profile.email;
  const isComplete = !!profile.displayName?.trim() && !!profile.profileTimezone;

  return (
    <main className="app-container me-page" data-testid="me-page">
      <header className="page-header">
        <div className="page-header-copy">
          <p className="eyebrow">Profile</p>
          <h1 data-testid="me-page-heading">My Profile</h1>
          <p className="page-description">
            Update your display name, timezone, and preferences so other members
            can find you in searches.
          </p>
        </div>
        <div className="page-header-actions">
          <span
            className="me-page-header-pill"
            data-tone={isComplete ? "ok" : "warn"}
            data-testid="me-page-status-pill"
          >
            <strong>{isComplete ? "Complete" : "Needs setup"}</strong>
            <span>
              {isComplete ? "Ready for searches" : "Finish in edit profile"}
            </span>
          </span>
        </div>
      </header>

      <section
        className="surface-section"
        aria-labelledby="profile-summary-heading"
        data-testid="profile-summary"
      >
        <div className="surface-section-header">
          <h2 id="profile-summary-heading">Profile summary</h2>
          <Link
            href="/me/profile"
            className="btn btn-primary"
            data-testid="profile-summary-edit-link"
          >
            Edit profile
          </Link>
        </div>
        <dl className="me-summary-list">
          <div className="me-summary-row">
            <dt>Display name</dt>
            <dd data-testid="profile-summary-display-name">{displayName}</dd>
          </div>
          <div className="me-summary-row">
            <dt>Email</dt>
            <dd data-testid="profile-summary-email">{profile.email}</dd>
          </div>
          <div className="me-summary-row">
            <dt>Timezone</dt>
            <dd data-testid="profile-summary-timezone">
              {profile.profileTimezone ?? "Not set"}
            </dd>
          </div>
          <div className="me-summary-row">
            <dt>Buffer</dt>
            <dd data-testid="profile-summary-buffer">
              {profile.bufferMinutes} minutes
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
