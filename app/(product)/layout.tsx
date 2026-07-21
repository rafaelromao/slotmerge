import type { ReactNode } from "react";
import Link from "next/link";
import { eq, count } from "drizzle-orm";
import { getServerSession } from "../../src/auth/session";
import { getDb } from "../../src/db/client";
import {
  discoverabilityConsents,
  userTopics,
  availabilityWindows,
} from "../../src/db/schema";
import { HeaderMenuToggle } from "./_components/HeaderMenuToggle";

export default async function ProductLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession();

  if (!session) {
    return (
      <main className="app-container">
        <p>Please sign in to continue.</p>
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

  const profileComplete = !!session.user.displayName;
  const discoverabilityComplete = discoverabilityRow.count > 0;
  const topicsComplete = topicsRow.count > 0;
  const availabilityComplete = availabilityRow.count > 0;
  const setupIncomplete =
    !profileComplete ||
    !discoverabilityComplete ||
    !topicsComplete ||
    !availabilityComplete;

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
          {setupIncomplete && (
            <span className="setup-chip" data-testid="setup-chip">
              Setup
            </span>
          )}
          <span className="calendar-badge" data-testid="calendar-badge">
            Calendar
          </span>
          <HeaderMenuToggle
            displayName={session.user.displayName}
            email={session.user.email}
          />
        </div>
      </header>
      <main className="main-content">{children}</main>
    </div>
  );
}
