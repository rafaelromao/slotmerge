import Link from "next/link";
import { and, eq, count, isNotNull } from "drizzle-orm";
import { getServerSession } from "../../src/auth/session";
import { getDb } from "../../src/db/client";
import {
  discoverabilityConsents,
  userTopics,
  availabilityWindows,
} from "../../src/db/schema";
import { requestMagicLinkAction } from "./_actions/request-magic-link";

type SearchParams = Promise<{
  error?: string | string[];
  sent?: string | string[];
}>;

export default async function SetupHomePage({
  searchParams,
}: {
  searchParams?: SearchParams;
} = {}) {
  const session = await getServerSession();

  if (!session) {
    const params = (await searchParams) ?? {};
    const errorCode = firstString(params.error);
    const sentFlag = firstString(params.sent) === "1";
    return (
      <main className="app-container">
        <h1>Please sign in to continue.</h1>
        {sentFlag ? (
          <p className="sign-in-sent" role="status" data-testid="sign-in-sent">
            Check your email for a magic link.
          </p>
        ) : (
          <form
            className="sign-in-form"
            data-testid="sign-in-form"
            action={requestMagicLinkAction}
          >
            <label className="sign-in-label" htmlFor="sign-in-email">
              Email
            </label>
            <input
              id="sign-in-email"
              name="email"
              type="email"
              className="sign-in-input"
              data-testid="sign-in-email"
              required
            />
            <button
              type="submit"
              className="btn btn-primary sign-in-submit"
              data-testid="sign-in-submit"
            >
              Send magic link
            </button>
            {errorCode ? (
              <p
                className="sign-in-error"
                role="alert"
                aria-live="polite"
                data-testid="sign-in-error"
              >
                {errorMessageFor(errorCode)}
              </p>
            ) : null}
          </form>
        )}
      </main>
    );
  }

  const db = getDb();
  const userId = session.user.id;

  const [discoverabilityRow] = await db
    .select({ count: count() })
    .from(discoverabilityConsents)
    .where(
      and(
        eq(discoverabilityConsents.userId, userId),
        isNotNull(discoverabilityConsents.grantedAt),
      ),
    )
    .limit(1);

  const [topicsRow] = await db
    .select({ count: count() })
    .from(userTopics)
    .where(eq(userTopics.userId, userId))
    .limit(1);

  const [availabilityRow] = await db
    .select({ count: count() })
    .from(availabilityWindows)
    .where(eq(availabilityWindows.userId, userId))
    .limit(1);

  const profileStatus = session.user.displayName ? "complete" : "pending";
  const discoverabilityStatus =
    discoverabilityRow.count > 0 ? "complete" : "pending";
  const topicsStatus = topicsRow.count > 0 ? "complete" : "pending";
  const availabilityStatus = availabilityRow.count > 0 ? "complete" : "pending";

  return (
    <div className="setup-checklist">
      <h1>Welcome to SlotMerge</h1>
      <p>Complete your profile setup to get started.</p>

      <div className="setup-cards">
        <SetupCard
          title="Profile"
          description="Set your display name, timezone, and preferences"
          href="/me/profile"
          status={profileStatus}
        />
        <SetupCard
          title="Discoverability"
          description="Control who can find you in searches"
          href="/me/discoverability"
          status={discoverabilityStatus}
        />
        <SetupCard
          title="Topics"
          description="Select topics you're interested in meeting about"
          href="/me/topics"
          status={topicsStatus}
        />
        <SetupCard
          title="Availability"
          description="Set your weekly availability windows"
          href="/me/availability"
          status={availabilityStatus}
        />
        <SetupCard
          title="Calendar Connection"
          description="Connect your calendar to import busy times"
          href="/me/calendar-connections"
          status="optional"
        />
      </div>
    </div>
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
    case "not_invited":
      return "This email is not on the invite list. Ask an admin to invite you.";
    case "invalid_email":
      return "Please enter a valid email address.";
    case "rate_limited":
      return "Too many requests. Please try again in a minute.";
    case "network_error":
      return "Could not reach the server. Check your connection and try again.";
    default:
      return "We could not send a magic link. Please try again.";
  }
}

type SetupCardProps = {
  title: string;
  description: string;
  href: string;
  status: "complete" | "pending" | "optional";
};

function SetupCard({ title, description, href, status }: SetupCardProps) {
  return (
    <div className="setup-card" data-status={status}>
      <div className="setup-card-content">
        <h2 className="setup-card-title">{title}</h2>
        <p className="setup-card-description">{description}</p>
        {status === "complete" && (
          <span className="setup-card-status">Complete</span>
        )}
        {status === "pending" && (
          <span className="setup-card-status setup-card-status-pending">
            Pending
          </span>
        )}
        {status === "optional" && (
          <span className="setup-card-status setup-card-status-optional">
            Optional
          </span>
        )}
      </div>
      <Link href={href} className="setup-card-action btn btn-primary">
        Continue
      </Link>
    </div>
  );
}
