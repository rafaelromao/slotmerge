import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PublicLayout from "../app/(public)/layout";
import VerifyPage from "../app/(public)/sign-in/verify/page";

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

async function renderVerify(
  params: Record<string, string | undefined> = {},
): Promise<string> {
  const search = buildSearchParams(params);
  const searchParams = Promise.resolve(
    Object.fromEntries(search.entries()),
  ) as unknown as Parameters<typeof VerifyPage>[0]["searchParams"];
  const element = await VerifyPage({ searchParams });
  return renderToString(await PublicLayout({ children: element }));
}

describe("Public /sign-in/verify page", () => {
  it("renders the auto-submit card on first visit with ?token", async () => {
    const html = await renderVerify({ token: "tok-abc" });
    expect(html).toContain("data-testid=\"verify-auto-submit\"");
    expect(html).toContain('action="/auth/magic-link/verify"');
    expect(html).toContain('method="POST"');
    expect(html).toContain('value="tok-abc"');
    expect(html).toContain("Signing you in");
  });

  it("renders the link_expired error state with non-leaking copy", async () => {
    const html = await renderVerify({
      error: "link_expired",
      email: "alice@example.com",
    });
    expect(html).toContain("data-testid=\"verify-error-link_expired\"");
    expect(html).toMatch(/sign-in link has expired/i);
    expect(html).toContain('href="/sign-in?email=alice%40example.com"');
  });

  it("renders the link_used error state with non-leaking copy", async () => {
    const html = await renderVerify({
      error: "link_used",
      email: "bob@example.com",
    });
    expect(html).toContain("data-testid=\"verify-error-link_used\"");
    expect(html).toMatch(/already been used/i);
    expect(html).toContain('href="/sign-in?email=bob%40example.com"');
  });

  it("renders the link_invalid error state with non-leaking copy", async () => {
    const html = await renderVerify({
      error: "link_invalid",
      email: "carol@example.com",
    });
    expect(html).toContain("data-testid=\"verify-error-link_invalid\"");
    expect(html).toMatch(/could not verify this sign-in link/i);
    expect(html).toContain('href="/sign-in?email=carol%40example.com"');
  });

  it("renders the auto-submit card when no params are provided", async () => {
    const html = await renderVerify();
    expect(html).toContain("data-testid=\"verify-auto-submit\"");
  });

  it("renders a single h1 heading", async () => {
    const html = await renderVerify({ token: "tok-abc" });
    const matches = html.match(/<h1[\s>]/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("the link back to /sign-in pre-fills the email", async () => {
    const html = await renderVerify({
      error: "link_invalid",
      email: "dan@example.com",
    });
    expect(html).toContain("Request a new link");
    expect(html).toContain("dan%40example.com");
  });

  it("does not reveal invite-list membership in error copy", async () => {
    const html = await renderVerify({
      error: "link_invalid",
      email: "eve@example.com",
    });
    expect(html).not.toMatch(/invite list/i);
    expect(html).not.toMatch(/not invited/i);
  });

  it("falls back to /sign-in without email query when no email is set", async () => {
    const html = await renderVerify({ error: "link_expired" });
    expect(html).toContain('href="/sign-in"');
  });
});