import { requirePageContext } from "../../../../src/lib/page-context";
import {
  createProfileWorkflow,
  defaultSupportedTimeZones,
} from "../../../../src/profile/profile-workflow";
import { ProfileForm } from "../_components/ProfileForm";

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

  const workflow = createProfileWorkflow();
  const result = await workflow.loadMe({ userId: context.user.id });

  if (!result.ok) {
    return (
      <main className="app-container">
        <div className="empty-state" data-testid="profile-empty">
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
  const params = (await searchParams) ?? {};
  const firstSaved = Array.isArray(params.saved)
    ? params.saved[0]
    : params.saved;
  const showSavedIndicator = firstSaved === "1";
  const supportedTimeZones = Array.from(defaultSupportedTimeZones()).sort();

  return (
    <main className="app-container">
      <h1>Edit profile</h1>

      {showSavedIndicator ? (
        <p
          className="profile-saved-indicator"
          role="status"
          data-testid="profile-saved-indicator"
        >
          Saved
        </p>
      ) : null}

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
    </main>
  );
}
