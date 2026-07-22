import Link from "next/link";

type SearchParams = Promise<{
  token?: string | string[];
  error?: string | string[];
  email?: string | string[];
  reason?: string | string[];
}>;

export const dynamic = "force-dynamic";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams?: SearchParams;
} = {}) {
  const params = (await searchParams) ?? {};
  const token = firstString(params.token);
  const errorCode = firstString(params.error);
  const email = firstString(params.email) ?? "";
  const reason = firstString(params.reason) ?? "";

  if (errorCode && isKnownErrorState(errorCode)) {
    return renderErrorState(errorCode, email, token ?? "", reason);
  }

  return (
    <main className="app-container">
      <h1>Signing you in</h1>
      <p
        className="verify-auto-submit"
        role="status"
        aria-live="polite"
        data-testid="verify-auto-submit"
      >
        Finishing sign-in to SlotMerge...
      </p>
      <noscript>
        <form
          method="POST"
          action="/auth/magic-link/verify"
          className="verify-form"
        >
          <input type="hidden" name="token" value={token ?? ""} />
          <button type="submit" className="btn btn-primary">
            Click here if not redirected automatically
          </button>
        </form>
      </noscript>
      <form
        method="POST"
        action="/auth/magic-link/verify"
        className="verify-form"
        data-testid="verify-form"
      >
        <input type="hidden" name="token" value={token ?? ""} />
      </form>
      <script
        dangerouslySetInnerHTML={{
          __html: `window.setTimeout(() => document.forms[document.forms.length - 1].submit(), 1500);`,
        }}
      />
    </main>
  );
}

function renderErrorState(
  state: VerifyErrorState,
  email: string,
  token: string,
  reason: string,
) {
  const signInHref = email
    ? `/sign-in?email=${encodeURIComponent(email)}`
    : "/sign-in";
  const copy = copyForErrorState(state);

  return (
    <main className="app-container">
      <h1>{copy.heading}</h1>
      <p
        className="verify-error-copy"
        role="alert"
        aria-live="polite"
        data-testid={`verify-error-${state}`}
      >
        {copy.body}
      </p>
      <span hidden data-verify-reason={reason}>
        {reason}
      </span>
      {state === "link_expired" && token ? (
        <form method="POST" action="/auth/magic-link/resend">
          <input type="hidden" name="token" value={token} />
          <button type="submit" className="btn btn-primary">
            Send a new link
          </button>
        </form>
      ) : null}
      <p>
        <Link
          href={signInHref}
          className="verify-request-new-link"
          data-testid={`verify-request-new-link-${state}`}
        >
          Request a new link
        </Link>
      </p>
    </main>
  );
}

function copyForErrorState(state: VerifyErrorState): {
  heading: string;
  body: string;
} {
  switch (state) {
    case "link_expired":
      return {
        heading: "This sign-in link has expired",
        body: "Sign-in links are valid for one hour. Request a new link and try again.",
      };
    case "link_used":
      return {
        heading: "This sign-in link has already been used",
        body: "Each sign-in link works once. Request a new link if you need to sign in again.",
      };
    case "link_invalid":
      return {
        heading: "We could not verify this sign-in link",
        body: "The link looks incomplete or has been changed. Request a new link and try again.",
      };
  }
}

const KNOWN_ERROR_STATES: ReadonlySet<string> = new Set([
  "link_expired",
  "link_used",
  "link_invalid",
]);

function isKnownErrorState(value: string): value is VerifyErrorState {
  return KNOWN_ERROR_STATES.has(value);
}

type VerifyErrorState = "link_expired" | "link_used" | "link_invalid";

function firstString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}
