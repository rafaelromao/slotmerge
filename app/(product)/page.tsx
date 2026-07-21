import Link from "next/link";
import { getServerSession } from "../../src/auth/session";

export default async function SetupHomePage() {
  const session = await getServerSession();

  if (!session) {
    return (
      <main className="app-container">
        <p>Please sign in to continue.</p>
      </main>
    );
  }

  return (
    <div className="setup-checklist">
      <h1>Welcome to SlotMerge</h1>
      <p>Complete your profile setup to get started.</p>

      <div className="setup-cards">
        <SetupCard
          title="Profile"
          description="Set your display name, timezone, and preferences"
          href="/me/profile"
          status={session.user.displayName ? "complete" : "pending"}
        />
        <SetupCard
          title="Discoverability"
          description="Control who can find you in searches"
          href="/me/discoverability"
          status="pending"
        />
        <SetupCard
          title="Topics"
          description="Select topics you're interested in meeting about"
          href="/me/topics"
          status="pending"
        />
        <SetupCard
          title="Availability"
          description="Set your weekly availability windows"
          href="/me/availability"
          status="pending"
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
