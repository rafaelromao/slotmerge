import { requirePageContext } from "../../../../src/lib/page-context";
import {
  createProfileWorkflow,
  defaultSupportedTimeZones,
} from "../../../../src/profile/profile-workflow";
import { systemClock } from "../../../../src/system/clock";
import { ProfileForm } from "../_components/ProfileForm";
import Link from "next/link";

type SearchParams = Promise<{
  saved?: string | string[];
}>;

export default async function ProfileEditPage({
  searchParams,
}: {
  searchParams?: SearchParams;
} = {}) {
  const context = await requirePageContext({
    roles: ["user", "organizer", "admin"],
  });

  const workflow = createProfileWorkflow({ clock: systemClock() });
  const result = await workflow.loadMe({ userId: context.user.id });

  if (!result.ok) {
    return (
      <main className="app-container">
        <div className="empty-state" data-testid="profile-empty">
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
  const params = (await searchParams) ?? {};
  const firstSaved = Array.isArray(params.saved)
    ? params.saved[0]
    : params.saved;
  const showSavedIndicator = firstSaved === "1";
  const supportedTimeZones = Array.from(defaultSupportedTimeZones()).sort();

  return (
    <main className="app-container me-page" data-testid="me-profile-page">
      <header className="page-header">
        <div className="page-header-copy">
          <p className="eyebrow">Profile</p>
          <h1 data-testid="me-profile-page-heading">Edit profile</h1>
          <p className="page-description">
            Your display name and timezone are required. Email is fixed by the
            sign-in you accepted.
          </p>
        </div>
        <div className="page-header-actions">
          <Link
            href="/me"
            className="btn btn-secondary"
            data-testid="me-profile-back-link"
          >
            Back to profile
          </Link>
        </div>
      </header>

      {showSavedIndicator ? (
        <p
          className="saved-banner"
          role="status"
          aria-live="polite"
          data-testid="profile-saved-indicator"
        >
          Profile saved.
        </p>
      ) : null}

      <section className="me-section-card">
        <div className="me-section-card-header">
          <h2>Profile details</h2>
          <p>
            Email is fixed by the sign-in you accepted; the other fields are
            editable.
          </p>
        </div>
        <div className="me-section-card-body">
          <ProfileForm
            csrfToken={context.csrfToken}
            supportedTimeZones={supportedTimeZones}
            defaultValues={{
              displayName: profile.displayName ?? "",
              email: profile.email,
              profileTimezone: profile.profileTimezone ?? "",
              bufferMinutes: profile.bufferMinutes,
              avatarUrl: profile.avatarUrl ?? "",
              shortBio: profile.shortBio ?? "",
            }}
          />
        </div>
      </section>
    </main>
  );
}
