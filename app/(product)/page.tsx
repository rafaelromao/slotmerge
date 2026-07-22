import Link from "next/link";
import { eq, count } from "drizzle-orm";
import { getServerSession } from "../../src/auth/session";
import { getDb } from "../../src/db/client";
import {
  discoverabilityConsents,
  userTopics,
  availabilityWindows,
} from "../../src/db/schema";
import { SignInForm } from "./_components/SignInForm";

export default async function SetupHomePage() {
  const session = await getServerSession();

  if (!session) {
    return (
      <main className="app-container">
        <h1>Please sign in to continue.</h1>
        <SignInForm />
      </main>
    );
  }

  const db = getDb();
  const userId = session.user.id;

  const [discoverabilityRow] = await db
    .select({ count: count() })
    .from(discoverabilityConsents)
    .where(eq(discoverabilityConsents.userId, userId))
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
