import type { ReactNode } from "react";
import Link from "next/link";
import { getServerSession } from "../../src/auth/session";
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
          {!session.user.displayName && (
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
