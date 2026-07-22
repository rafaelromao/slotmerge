type SearchParams = Promise<{
  error?: string | string[];
  sent?: string | string[];
  email?: string | string[];
  returnTo?: string | string[];
}>;

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: SearchParams;
} = {}) {
  const params = (await searchParams) ?? {};
  const errorCode = firstString(params.error);
  const sentFlag = firstString(params.sent) === "1";
  const prefilledEmail = firstString(params.email) ?? "";
  const returnTo = firstString(params.returnTo) ?? "";

  if (sentFlag) {
    return (
      <main className="app-container">
        <h1>Check your inbox</h1>
        <p
          className="sign-in-sent"
          role="status"
          data-testid="sign-in-sent"
        >
          If an account exists for that email, we just sent a sign-in link.
        </p>
      </main>
    );
  }

  return (
    <main className="app-container">
      <h1>Sign in</h1>
      <p className="sign-in-help">
        We will email you a sign-in link. Calendar access is separate and is
        connected later.
      </p>
      <form
        className="sign-in-form"
        data-testid="sign-in-form"
        action="/auth/magic-link/request"
        method="POST"
      >
        <label className="sign-in-label" htmlFor="sign-in-email">
          Email
        </label>
        <input
          id="sign-in-email"
          name="email"
          type="email"
          className="sign-in-input"
          data-testid="sign-in-email"
          defaultValue={prefilledEmail}
          required
          autoComplete="email"
        />
        {returnTo ? (
          <input type="hidden" name="returnTo" value={returnTo} />
        ) : null}
        <button
          type="submit"
          className="btn btn-primary sign-in-submit"
          data-testid="sign-in-submit"
        >
          Send magic link
        </button>
        {errorCode ? (
          <p
            className="sign-in-error"
            role="alert"
            aria-live="polite"
            data-testid="sign-in-error"
          >
            {errorMessageFor(errorCode)}
          </p>
        ) : null}
      </form>
    </main>
  );
}

function firstString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function errorMessageFor(code: string): string {
  switch (code) {
    case "invalid_email":
      return "Please enter a valid email address.";
    case "rate_limited":
      return "Too many requests. Please try again in a minute.";
    default:
      return "We could not send a magic link. Please try again.";
  }
}