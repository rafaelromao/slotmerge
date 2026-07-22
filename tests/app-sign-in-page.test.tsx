import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PublicLayout from "../app/(public)/layout";
import SignInPage from "../app/(public)/sign-in/page";

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

async function renderSignIn(
  params: Record<string, string | undefined> = {},
): Promise<string> {
  const search = buildSearchParams(params);
  const searchParams = Promise.resolve(
    Object.fromEntries(search.entries()),
  ) as unknown as Parameters<typeof SignInPage>[0]["searchParams"];
  const element = await SignInPage({ searchParams });
  return renderToString(await PublicLayout({ children: element }));
}

describe("Public sign-in page", () => {
  it("renders the email input and Send magic link button", async () => {
    const html = await renderSignIn();
    expect(html).toContain("data-testid=\"sign-in-email\"");
    expect(html).toContain("data-testid=\"sign-in-submit\"");
    expect(html).toContain("Send magic link");
  });

  it("renders a single h1 heading", async () => {
    const html = await renderSignIn();
    const matches = html.match(/<h1[\s>]/g) ?? [];
    expect(matches.length).toBe(1);
    expect(html).toContain("<h1");
    expect(html).toContain("Sign in");
  });

  it("posts the form to /auth/magic-link/request", async () => {
    const html = await renderSignIn();
    expect(html).toContain('action="/auth/magic-link/request"');
    expect(html).toContain('method="POST"');
  });

  it("pre-fills the email input when ?email is set", async () => {
    const html = await renderSignIn({ email: "alice@example.com" });
    expect(html).toContain('value="alice@example.com"');
    expect(html).toContain('id="sign-in-email"');
  });

  it("renders the inline error surface with copy when ?error is set", async () => {
    const html = await renderSignIn({ error: "invalid_email" });
    expect(html).toContain("data-testid=\"sign-in-error\"");
    expect(html).toMatch(/valid email/i);
  });

  it("renders the sent hint when ?sent=1 is set", async () => {
    const html = await renderSignIn({ sent: "1" });
    expect(html).toContain("data-testid=\"sign-in-sent\"");
    expect(html).toMatch(/check your inbox|we just sent|magic link/i);
  });

  it("renders the Calendar Connection help text below the form", async () => {
    const html = await renderSignIn();
    expect(html).toMatch(/calendar access is separate/i);
  });

  it("includes the returnTo hidden input when ?returnTo is set", async () => {
    const html = await renderSignIn({ returnTo: "/admin" });
    expect(html).toContain('name="returnTo"');
    expect(html).toContain('value="/admin"');
  });
});