import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PublicLayout from "../app/(public)/layout";
import SentPage from "../app/(public)/sign-in/sent/page";

function buildSearchParams(
  params: Record<string, string | undefined>,
): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      search.set(key, value);
    }
  }
  return search;
}

async function renderSent(
  params: Record<string, string | undefined> = {},
): Promise<string> {
  const search = buildSearchParams(params);
  const searchParams = Promise.resolve(
    Object.fromEntries(search.entries()),
  ) as unknown as Parameters<typeof SentPage>[0]["searchParams"];
  const element = await SentPage({ searchParams });
  return renderToString(await PublicLayout({ children: element }));
}

describe("Public /sign-in/sent page", () => {
  it("renders the masked email and the non-leaking copy", async () => {
    const html = await renderSent({ email: "alice@example.com" });
    expect(html).toContain("a****@example.com");
    expect(html).toMatch(/if an account exists for that email/i);
    expect(html).toContain("we just sent a sign-in link");
  });

  it("renders a single h1 heading", async () => {
    const html = await renderSent({ email: "alice@example.com" });
    const matches = html.match(/<h1[\s>]/g) ?? [];
    expect(matches.length).toBe(1);
    expect(html).toContain("Check your inbox");
  });

  it("renders a generic message when no email is provided", async () => {
    const html = await renderSent();
    expect(html).toMatch(/check your inbox/i);
    expect(html).not.toContain("a***@");
  });

  it("renders a link back to /sign-in for 'Use a different email'", async () => {
    const html = await renderSent({ email: "alice@example.com" });
    expect(html).toContain("Use a different email");
    expect(html).toContain('href="/sign-in"');
  });
});