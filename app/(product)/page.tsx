import Link from "next/link";
import { redirect } from "next/navigation";

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
  const session = await getServerSession();

  if (!session) {
    const params = (await searchParams) ?? {};
    const returnTo = firstString(params.returnTo);
    const target = returnTo
      ? `/sign-in?returnTo=${encodeURIComponent("/" + (returnTo.startsWith("/") ? returnTo.slice(1) : returnTo))}`
      : "/sign-in";
    redirect(target);
  }

  const result = await createProductionSetupHomeWorkflow().loadSummary({
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

  return (
    <div className="setup-checklist">
      <h1>Welcome to SlotMerge</h1>
      <p>Complete your profile setup to get started.</p>

      <div className="setup-cards">
        {SETUP_CARDS.map((card) => {
          const item = itemsByKey.get(card.key);
          if (!item) {
            throw new Error(
              `Setup Home page is missing the "${card.key}" item.`,
            );
          }
          const status: "complete" | "pending" | "optional" = item.complete
            ? "complete"
            : item.required
              ? "pending"
              : "optional";
          return (
            <SetupCard
              key={card.key}
              title={card.title}
              description={card.description}
              href={card.href}
              status={status}
            />
          );
        })}
      </div>
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
  title: string;
  description: string;
  href: string;
  status: "complete" | "pending" | "optional";
};

function SetupCard({ title, description, href, status }: SetupCardProps) {
  return (
    <div className="setup-card" data-status={status}>
      <div className="setup-card-content">
        <h2 className="setup-card-title">{title}</h2>
        <p className="setup-card-description">{description}</p>
        {status === "complete" && (
          <span className="setup-card-status">Complete</span>
        )}
        {status === "pending" && (
          <span className="setup-card-status setup-card-status-pending">
            Pending
          </span>
        )}
        {status === "optional" && (
          <span className="setup-card-status setup-card-status-optional">
            Optional
          </span>
        )}
      </div>
      <Link href={href} className="setup-card-action btn btn-primary">
        Continue
      </Link>
    </div>
  );
}
