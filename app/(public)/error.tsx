"use client";

import { useEffect } from "react";

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Public segment error:", error);
  }, [error]);

  return (
    <main className="app-container">
      <div className="error-banner" role="alert">
        <h1>Something went wrong</h1>
        <p>
          An unexpected error occurred. Please try again. You can still sign in
          or request a new magic link.
        </p>
        {error.digest && (
          <p className="error-digest">Reference: {error.digest}</p>
        )}
        <button onClick={reset} className="btn btn-primary" type="button">
          Try again
        </button>
      </div>
    </main>
  );
}
