"use client";

import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin segment error:", error);
  }, [error]);

  return (
    <main className="app-container">
      <div className="error-banner" role="alert">
        <h1>Something went wrong</h1>
        <p>
          An unexpected error occurred on the Admin page. Your session has been
          preserved. Please try again.
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
