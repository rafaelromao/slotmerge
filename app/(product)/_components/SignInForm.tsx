"use client";

import { useState, type FormEvent } from "react";

type SignInFormProps = {
  initialError?: string | null;
};

type SignInResponse = { sent: true } | { error: string };

export function SignInForm({ initialError = null }: SignInFormProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/auth/magic-link/request", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ email }).toString(),
        redirect: "manual",
      });
      if (response.status === 0 || response.type === "opaqueredirect") {
        setPending(false);
        return;
      }
      if (response.ok) {
        setSent(true);
        setPending(false);
        return;
      }
      const body = (await response.json().catch(() => ({}))) as SignInResponse;
      if ("error" in body) {
        setError(body.error);
      } else {
        setError("request_failed");
      }
    } catch {
      setError("network_error");
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="sign-in-form" data-testid="sign-in-form">
        <p role="status" data-testid="sign-in-sent">
          Check your email for a magic link.
        </p>
      </div>
    );
  }

  return (
    <form
      className="sign-in-form"
      data-testid="sign-in-form"
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
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
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <button
        type="submit"
        className="btn btn-primary sign-in-submit"
        data-testid="sign-in-submit"
        disabled={pending}
      >
        {pending ? "Sending..." : "Send magic link"}
      </button>
      {error ? (
        <p
          className="sign-in-error"
          role="alert"
          aria-live="polite"
          data-testid="sign-in-error"
        >
          {errorMessageFor(error)}
        </p>
      ) : null}
    </form>
  );
}

function errorMessageFor(code: string): string {
  switch (code) {
    case "not_invited":
      return "This email is not on the invite list. Ask an admin to invite you.";
    case "invalid_email":
      return "Please enter a valid email address.";
    case "rate_limited":
      return "Too many requests. Please try again in a minute.";
    case "network_error":
      return "Could not reach the server. Check your connection and try again.";
    default:
      return "We could not send a magic link. Please try again.";
  }
}
