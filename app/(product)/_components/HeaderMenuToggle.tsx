"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

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
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointer(event: PointerEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("pointerdown", onPointer);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("pointerdown", onPointer);
        document.removeEventListener("keydown", onKey);
      };
    }
  }, [open]);

  const name = displayName?.trim() || email.split("@")[0];
  const initial = (displayName?.[0] ?? email[0] ?? "?").toUpperCase();

  return (
    <div className="avatar-dropdown" ref={wrapperRef}>
      <button
        type="button"
        className="top-bar-avatar"
        aria-expanded={open ? "true" : "false"}
        aria-haspopup="menu"
        aria-label={`Account menu for ${displayName ?? email}`}
        data-testid="avatar-dropdown-trigger"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="top-bar-avatar-initial" aria-hidden="true">
          {initial}
        </span>
        <span className="top-bar-avatar-name">{name}</span>
      </button>
      {open ? (
        <div className="avatar-dropdown-menu-wrap">{children}</div>
      ) : null}
    </div>
  );
}
