"use client";

import Link from "next/link";

type HeaderMenuToggleProps = {
  displayName: string | null;
  email: string;
};

export function HeaderMenuToggle({
  displayName,
  email,
}: HeaderMenuToggleProps) {
  return (
    <details className="avatar-dropdown">
      <summary
        className="avatar-dropdown-trigger"
        aria-haspopup="menu"
        data-testid="avatar-dropdown-trigger"
      >
        <span className="avatar-initial">{displayName?.[0] ?? email[0]}</span>
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
  );
}
