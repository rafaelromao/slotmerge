"use client";

import type { ReactNode } from "react";
import { useState } from "react";

type HeaderMenuToggleProps = {
  displayName: string | null;
  email: string;
  children?: ReactNode;
};

export function HeaderMenuToggle({
  displayName,
  email,
  children,
}: HeaderMenuToggleProps) {
  const [open, setOpen] = useState(false);

  return (
    <details
      className="avatar-dropdown"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary
        className="avatar-dropdown-trigger"
        aria-expanded={open ? "true" : "false"}
        aria-haspopup="menu"
        data-testid="avatar-dropdown-trigger"
      >
        <span className="avatar-initial">{displayName?.[0] ?? email[0]}</span>
      </summary>
      {children}
    </details>
  );
}
