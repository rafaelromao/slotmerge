import type { ReactNode } from "react";
import Link from "next/link";
import { getSessionFromRequest } from "../../src/auth/session";

export default async function ProductLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getSessionFromRequest(new Request("http://localhost"));

  if (!session) {
    return (
      <html lang="en">
        <body>
          <main className="app-container">
            <p>Please sign in to continue.</p>
          </main>
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body>
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
          <main className="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
