"use client";

import { useEffect, useState } from "react";

type CapturedEmail = {
  type: string;
  payload: Record<string, unknown>;
};

export function LocalMagicLink({ email }: { email: string }) {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setInterval(() => {
      void (async () => {
        const response = await fetch(
          `/api/local/emails/${encodeURIComponent(email)}`,
        );
        if (!response.ok) return;
        const { emails } = (await response.json()) as {
          emails: CapturedEmail[];
        };
        const message = [...emails]
          .reverse()
          .find((item) => item.type === "magic-link");
        const magicLink = message?.payload.magicLinkUrl;
        if (typeof magicLink === "string" && !cancelled) {
          setHref(magicLink);
          window.clearInterval(timer);
        }
      })();
    }, 500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [email]);

  return (
    <section className="local-magic-link" aria-live="polite">
      <p className="eyebrow">Local development</p>
      {href ? (
        <a className="btn btn-primary" href={href}>
          Continue with mock magic link
        </a>
      ) : (
        <p>Preparing your mock magic link...</p>
      )}
    </section>
  );
}
