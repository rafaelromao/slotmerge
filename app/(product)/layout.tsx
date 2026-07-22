import type { ReactNode } from "react";
import Link from "next/link";
import { and, eq, count, isNotNull } from "drizzle-orm";
import { getServerSession } from "../../src/auth/session";
import { getDb } from "../../src/db/client";
import {
  discoverabilityConsents,
  userTopics,
  availabilityWindows,
  calendarConnections,
} from "../../src/db/schema";
import { HeaderMenuToggle } from "./_components/HeaderMenuToggle";
import {
  buildCalendarBadgeState,
  renderCalendarBadgeLabel,
} from "./_components/CalendarBadgeState";

export default async function ProductLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession();

  if (!session) {
    return (
      <main className="app-container app-container-public">{children}</main>
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

  const calendarRows = await db
    .select({ status: calendarConnections.status })
    .from(calendarConnections)
    .where(eq(calendarConnections.userId, userId))
    .limit(100);

  const profileComplete = !!session.user.displayName;
  const discoverabilityComplete = discoverabilityRow.count > 0;
  const topicsComplete = topicsRow.count > 0;
  const availabilityComplete = availabilityRow.count > 0;
  const setupIncomplete =
    !profileComplete ||
    !discoverabilityComplete ||
    !topicsComplete ||
    !availabilityComplete;
  const calendarStatuses = calendarRows.map((row) => row.status);
  const calendarStatus = calendarStatuses.some((status) =>
    ["needs_reconnect", "sync_delayed", "disconnected"].includes(status),
  )
    ? "needs_reconnect"
    : calendarStatuses.includes("unsupported")
      ? "unsupported"
      : calendarStatuses.includes("connected")
        ? "connected"
        : undefined;
  const calendarBadge = buildCalendarBadgeState(calendarStatus);
  const calendarBadgeLabel = renderCalendarBadgeLabel(calendarBadge);

  return (
    <div className="product-shell">
      <header className="top-bar">
        <details
          open
          className="primary-nav"
          data-testid="primary-nav"
          aria-label="Primary navigation"
        >
          <summary
            className="header-menu-toggle"
            data-testid="primary-nav-toggle"
            aria-label="Toggle navigation"
          >
            <span className="header-menu-toggle-bar" aria-hidden="true" />
            <span className="header-menu-toggle-bar" aria-hidden="true" />
            <span className="header-menu-toggle-bar" aria-hidden="true" />
          </summary>
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
        </details>
        <div className="top-bar-right">
          {setupIncomplete && (
            <span className="setup-chip" data-testid="setup-chip">
              Setup
            </span>
          )}
          <Link
            href="/me/calendar-connections"
            className={`calendar-badge calendar-badge-${calendarBadge.status}`}
            data-status={calendarBadge.status}
            data-testid={`calendar-badge-${calendarBadge.status}`}
            aria-label={calendarBadgeLabel}
          >
            {calendarBadgeLabel}
          </Link>
          <HeaderMenuToggle
            displayName={session.user.displayName}
            email={session.user.email}
          >
            <ul className="avatar-dropdown-menu" role="menu">
              <li>
                <Link
                  href="/me"
                  role="menuitem"
                  data-testid="avatar-menu-my-profile"
                >
                  My Profile
                </Link>
              </li>
              <li>
                <form method="POST" action="/auth/session">
                  <input type="hidden" name="_csrf" value={session.csrfToken} />
                  <button
                    type="submit"
                    role="menuitem"
                    data-testid="avatar-menu-sign-out"
                  >
                    Sign Out
                  </button>
                </form>
              </li>
            </ul>
          </HeaderMenuToggle>
        </div>
      </header>
      <main className="main-content">{children}</main>
    </div>
  );
}
