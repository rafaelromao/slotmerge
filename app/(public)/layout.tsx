import type { ReactNode } from "react";
import Link from "next/link";
import { ThemeToggle } from "../components/ThemeToggle";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="public-shell">
      <header className="public-header">
        <Link
          href="/sign-in"
          className="wordmark"
          aria-label="SlotMerge sign in"
        >
          <span className="wordmark-mark" aria-hidden="true">
            S
          </span>
          <span>SlotMerge</span>
        </Link>
        <ThemeToggle />
      </header>
      {children}
    </div>
  );
}
