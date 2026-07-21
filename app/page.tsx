import Link from "next/link";
import { getSessionFromRequest } from "../src/auth/session";

export default async function SetupHomePage() {
  const session = await getSessionFromRequest(new Request("http://localhost"));

  if (!session) {
    return (
      <main className="app-container">
        <p>Please sign in to continue.</p>
      </main>
    );
  }

  return (
    <div className="product-shell">
      <header className="top-bar">
        <nav className="top-nav" aria-label="Main navigation">
          <Link href="/" className="nav-link nav-link-active">
            Home
          </Link>
          {session.user.role === "organizer" ||
          session.user.role === "admin" ? (
            <Link href="/searches" className="nav-link">
              Search
            </Link>
          ) : null}
          {session.user.role === "admin" ? (
            <Link href="/admin" className="nav-link">
              Admin
            </Link>
          ) : null}
        </nav>
        <div className="top-bar-right">
          <span className="setup-chip" data-testid="setup-chip">
            Setup
          </span>
          <span className="calendar-badge" data-testid="calendar-badge">
            Calendar
          </span>
          <details className="avatar-dropdown">
            <summary
              className="avatar-dropdown-trigger"
              aria-expanded="false"
              aria-haspopup="menu"
              data-testid="avatar-dropdown-trigger"
            >
              <span className="avatar-initial">
                {session.user.displayName?.[0] ?? session.user.email[0]}
              </span>
            </summary>
            <ul className="avatar-dropdown-menu" role="menu">
              <li>
                <Link href="/me" role="menuitem">
                  My Profile
                </Link>
              </li>
              <li>
                <form method="POST" action="/auth/session">
                  <button type="submit" role="menuitem">
                    Sign Out
                  </button>
                </form>
              </li>
            </ul>
          </details>
        </div>
      </header>
      <main className="main-content">
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
      </main>
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
