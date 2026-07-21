"use client";

type HeaderMenuToggleProps = {
  ariaControls: string;
  ariaLabel: string;
};

export function HeaderMenuToggle({
  ariaControls,
  ariaLabel,
}: HeaderMenuToggleProps) {
  return (
    <button
      type="button"
      aria-expanded="false"
      aria-controls={ariaControls}
      aria-label={ariaLabel}
      data-testid="header-menu-toggle"
      className="header-menu-toggle"
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  );
}
