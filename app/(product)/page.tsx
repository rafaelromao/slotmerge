import Link from "next/link";
import { redirect } from "next/navigation";
import { systemClock } from "../../src/system/clock";

import { getServerSession } from "../../src/auth/session";
import { createProductionSetupHomeWorkflow } from "../../src/workflow/setup-home-production";

type SearchParams = Promise<{
  returnTo?: string | string[];
}>;

type SetupCardConfig = {
  key: string;
  title: string;
  description: string;
  href: string;
};

const SETUP_CARDS: ReadonlyArray<SetupCardConfig> = [
  {
    key: "profile",
    title: "Profile",
    description: "Set your display name, timezone, and preferences",
    href: "/me/profile",
  },
  {
    key: "discoverability",
    title: "Discoverability",
    description: "Control who can find you in searches",
    href: "/me/discoverability",
  },
  {
    key: "topics",
    title: "Topics",
    description: "Select topics you're interested in meeting about",
    href: "/me/topics",
  },
  {
    key: "availability",
    title: "Availability",
    description: "Set your weekly availability windows",
    href: "/me/availability",
  },
  {
    key: "calendarConnection",
    title: "Calendar Connection",
    description: "Connect your calendar to import busy times",
    href: "/me/calendar-connections",
  },
];

export default async function SetupHomePage({
  searchParams,
}: {
  searchParams?: SearchParams;
} = {}) {
  const session = await getServerSession({ clock: systemClock() });

  if (!session) {
    const params = (await searchParams) ?? {};
    const returnTo = firstString(params.returnTo);
    const target = returnTo
      ? `/sign-in?returnTo=${encodeURIComponent("/" + (returnTo.startsWith("/") ? returnTo.slice(1) : returnTo))}`
      : "/sign-in";
    redirect(target);
  }

  const result = await createProductionSetupHomeWorkflow(
    systemClock(),
  ).loadSummary({
    userId: session.user.id,
  });

  if (!result.ok) {
    return (
      <main className="app-container">
        <p
          className="form-error-banner"
          role="alert"
          data-testid="setup-home-error-banner"
        >
          Setup status is temporarily unavailable. Refresh the page to retry.
        </p>
      </main>
    );
  }

  const itemsByKey = new Map(
    result.value.items.map((item) => [item.key, item]),
  );

  const items = SETUP_CARDS.map((card) => {
    const item = itemsByKey.get(card.key);
    if (!item) {
      throw new Error(`Setup Home page is missing the "${card.key}" item.`);
    }
    const status: "complete" | "pending" | "optional" = item.complete
      ? "complete"
      : item.required
        ? "pending"
        : "optional";
    return { card, status };
  });

  const requiredCount = items.filter((i) => i.status !== "optional").length;
  const completedRequired = items.filter(
    (i) => i.status !== "optional" && i.status === "complete",
  ).length;
  const completedPct = Math.round((completedRequired / requiredCount) * 100);
  const allDone = completedRequired === requiredCount;

  return (
    <div className="setup-checklist" data-testid="setup-home">
      <header className="setup-checklist-header">
        <div className="setup-checklist-header-copy">
          <p className="eyebrow">Setup</p>
          <h1>Welcome to SlotMerge</h1>
          <p className="page-description">
            Complete each step to start appearing in Organizer Searches. You
            will appear in Organizer Searches only after setup is complete.
          </p>
        </div>
        <div
          className="setup-checklist-progress"
          data-testid="setup-checklist-progress"
        >
          <div className="setup-checklist-progress-label">
            <strong>{completedPct}%</strong>
            <span>
              {completedRequired} of {requiredCount} required
            </span>
          </div>
          <div
            className="setup-checklist-progress-bar"
            role="progressbar"
            aria-valuenow={completedPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Setup progress: ${completedPct}% complete`}
          >
            <span
              className="setup-checklist-progress-bar-fill"
              style={{ width: `${completedPct}%` }}
            />
          </div>
          <p className="setup-checklist-progress-help">
            {allDone
              ? "All required steps are done. Calendar Connection is optional."
              : "Continue with the next pending step."}
          </p>
        </div>
      </header>

      <ol className="setup-cards" data-testid="setup-cards">
        {items.map(({ card, status }, index) => (
          <SetupCard
            key={card.key}
            index={index + 1}
            title={card.title}
            description={card.description}
            href={card.href}
            status={status}
          />
        ))}
      </ol>
    </div>
  );
}

function firstString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

type SetupCardProps = {
  index: number;
  title: string;
  description: string;
  href: string;
  status: "complete" | "pending" | "optional";
};

function SetupCard({
  index,
  title,
  description,
  href,
  status,
}: SetupCardProps) {
  const statusPill =
    status === "complete"
      ? { label: "Complete", tone: "ok" as const }
      : status === "pending"
        ? { label: "Pending", tone: "warn" as const }
        : { label: "Optional", tone: "muted" as const };
  const actionClass =
    status === "complete"
      ? "btn btn-secondary"
      : status === "pending"
        ? "btn btn-primary"
        : "btn btn-secondary";
  const actionLabel = status === "complete" ? "Review" : "Continue";
  return (
    <li className="setup-card" data-status={status}>
      <span className="setup-card-numeral" aria-hidden="true">
        {String(index).padStart(2, "0")}
      </span>
      <div className="setup-card-content">
        <span className="setup-card-status-pill" data-tone={statusPill.tone}>
          {statusPill.label}
        </span>
        <h2 className="setup-card-title">{title}</h2>
        <p className="setup-card-description">{description}</p>
      </div>
      <Link
        href={href}
        className={`setup-card-action ${actionClass}`}
        data-testid={`setup-card-action-${title.toLowerCase()}`}
      >
        {actionLabel}
      </Link>
    </li>
  );
}
