import { test, expect } from "@playwright/test";
import { captureState } from "../../../helpers/playwright/screenshot-helper";

const BASE_URL = "http://localhost:3000";
const INVITED_EMAIL = "invited-user@example.com";
const UNINVITED_EMAIL = "stranger@example.com";

type CapturedEmailsResponse = {
  emails: Array<{
    type: string;
    payload: Record<string, unknown>;
  }>;
};

async function getCapturedEmails(
  email: string,
): Promise<CapturedEmailsResponse> {
  const response = await fetch(
    `${BASE_URL}/api/local/emails/${encodeURIComponent(email)}`,
  );
  if (!response.ok) {
    return { emails: [] };
  }
  return (await response.json()) as CapturedEmailsResponse;
}

async function getMagicLinkCount(email: string): Promise<number> {
  const { emails } = await getCapturedEmails(email);
  return emails.filter((item) => item.type === "magic-link").length;
}

async function waitForMagicLink(
  email: string,
  previousCount: number,
  timeoutMs = 10000,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { emails } = await getCapturedEmails(email);
    const magicLinkEmails = emails.filter((item) => item.type === "magic-link");
    if (magicLinkEmails.length > previousCount) {
      const url = magicLinkEmails.at(-1)?.payload["magicLinkUrl"];
      return typeof url === "string" ? url : null;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

function absoluteUrl(maybeRelativeUrl: string): string {
  if (maybeRelativeUrl.startsWith("http")) {
    return maybeRelativeUrl;
  }
  return `${BASE_URL}${maybeRelativeUrl}`;
}

test.describe("Magic-link request, verify, and resend", () => {
  test("happy path: public /sign-in form → sent → verify (auto-submit) → 303 to /", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });
    await page.goto("/sign-in");

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await captureState(page, "sign-in", "signed-out");

    const previousCount = await getMagicLinkCount(INVITED_EMAIL);
    await page.getByTestId("sign-in-email").fill(INVITED_EMAIL);
    await page.getByTestId("sign-in-submit").click();

    await page.waitForURL((url) => url.pathname === "/sign-in/sent");
    await expect(page.getByTestId("sent-non-leaking")).toContainText(
      "If an account exists for that email, we just sent a sign-in link.",
    );
    await captureState(page, "sign-in", "sent");

    const magicLinkUrl = await waitForMagicLink(INVITED_EMAIL, previousCount);
    expect(magicLinkUrl).not.toBeNull();
    expect(magicLinkUrl).toContain("/sign-in/verify?token=");

    const absoluteMagicLinkUrl = absoluteUrl(magicLinkUrl!);
    await page.goto(absoluteMagicLinkUrl);

    await expect(page.getByTestId("verify-auto-submit")).toBeVisible();
    await captureState(page, "sign-in", "verify-auto-submit");

    await page.waitForURL((url) => url.pathname === "/");
    await expect(
      page.getByRole("heading", { name: "Welcome to SlotMerge" }),
    ).toBeVisible();
  });

  test("sign-in page is /sign-in, not /", async ({ page }) => {
    await page.goto("/sign-in");
    expect(new URL(page.url()).pathname).toBe("/sign-in");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("/sign-in?email= pre-fills the email input", async ({ page }) => {
    await page.goto(
      `/sign-in?email=${encodeURIComponent("alice@example.com")}`,
    );
    const emailInput = page.getByTestId("sign-in-email");
    await expect(emailInput).toHaveValue("alice@example.com");
  });

  test("uninvited email gets the same 202 'check your inbox' page", async ({
    page,
  }) => {
    const previousCount = await getMagicLinkCount(UNINVITED_EMAIL);
    await page.goto("/sign-in");

    await page.getByTestId("sign-in-email").fill(UNINVITED_EMAIL);
    await page.getByTestId("sign-in-submit").click();

    await page.waitForURL((url) => url.pathname === "/sign-in/sent");
    await expect(page.getByTestId("sent-non-leaking")).toContainText(
      "If an account exists for that email, we just sent a sign-in link.",
    );
    const after = await getMagicLinkCount(UNINVITED_EMAIL);
    expect(after).toBe(previousCount);
  });

  test("replaying a used token returns link_used with a Request a new link link", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });
    await page.goto("/sign-in");

    const previousCount = await getMagicLinkCount(INVITED_EMAIL);
    await page.getByTestId("sign-in-email").fill(INVITED_EMAIL);
    await page.getByTestId("sign-in-submit").click();

    const magicLinkUrl = await waitForMagicLink(INVITED_EMAIL, previousCount);
    expect(magicLinkUrl).not.toBeNull();
    const absoluteMagicLinkUrl = absoluteUrl(magicLinkUrl!);
    await page.goto(absoluteMagicLinkUrl);
    await page.waitForURL((url) => url.pathname === "/");

    const tokenUrl = new URL(absoluteMagicLinkUrl);
    const rawToken = tokenUrl.searchParams.get("token") ?? "";
    expect(rawToken.length).toBeGreaterThan(0);

    const replayResponse = await page.request.post(
      `${BASE_URL}/auth/magic-link/verify`,
      {
        form: { token: rawToken },
        maxRedirects: 0,
      },
    );
    expect(replayResponse.status()).toBe(400);
    const replayHtml = await replayResponse.text();
    expect(replayHtml).toContain("link_used");
    expect(replayHtml).toContain("invite_already_accepted");
    expect(replayHtml).toContain("Request a new link");
    expect(replayHtml).toContain(
      `href="/sign-in?email=${encodeURIComponent(INVITED_EMAIL)}"`,
    );

    await page.goto(
      `${BASE_URL}/sign-in/verify?error=${encodeURIComponent("link_used")}&email=${encodeURIComponent(INVITED_EMAIL)}`,
    );
    await expect(page.getByTestId("verify-error-link_used")).toBeVisible();
    await captureState(page, "sign-in", "verify-error-used");
  });

  test("waiting past expiry returns link_expired with a Request a new link link", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });
    await page.goto("/sign-in");

    const previousCount = await getMagicLinkCount(INVITED_EMAIL);
    await page.getByTestId("sign-in-email").fill(INVITED_EMAIL);
    await page.getByTestId("sign-in-submit").click();

    const magicLinkUrl = await waitForMagicLink(INVITED_EMAIL, previousCount);
    expect(magicLinkUrl).not.toBeNull();
    const tokenUrl = new URL(magicLinkUrl!);
    const rawToken = tokenUrl.searchParams.get("token") ?? "";
    expect(rawToken.length).toBeGreaterThan(0);

    await page.clock.fastForward(2 * 60 * 60 * 1000);

    const expiredResponse = await page.request.post(
      `${BASE_URL}/auth/magic-link/verify`,
      {
        form: { token: rawToken },
        maxRedirects: 0,
      },
    );
    expect(expiredResponse.status()).toBe(400);
    const expiredHtml = await expiredResponse.text();
    expect(expiredHtml).toContain("link_expired");
    expect(expiredHtml).toContain("token_expired");
    expect(expiredHtml).toContain("Request a new link");
    expect(expiredHtml).toContain(
      `href="/sign-in?email=${encodeURIComponent(INVITED_EMAIL)}"`,
    );

    await page.goto(
      `${BASE_URL}/sign-in/verify?error=${encodeURIComponent("link_expired")}&email=${encodeURIComponent(INVITED_EMAIL)}`,
    );
    await expect(page.getByTestId("verify-error-link_expired")).toBeVisible();
    await captureState(page, "sign-in", "verify-error-expired");
  });

  test("a malformed token returns link_invalid with a Request a new link link", async ({
    page,
  }) => {
    const invalidResponse = await page.request.post(
      `${BASE_URL}/auth/magic-link/verify`,
      {
        form: { token: "not-a-real-token" },
        maxRedirects: 0,
      },
    );
    expect(invalidResponse.status()).toBe(400);
    const invalidHtml = await invalidResponse.text();
    expect(invalidHtml).toContain("link_invalid");
    expect(invalidHtml).toContain("invalid_token");
    expect(invalidHtml).toContain("Request a new link");
    expect(invalidHtml).toContain('href="/sign-in"');

    await page.goto(
      `${BASE_URL}/sign-in/verify?error=${encodeURIComponent("link_invalid")}`,
    );
    await expect(page.getByTestId("verify-error-link_invalid")).toBeVisible();
    await captureState(page, "sign-in", "verify-error-invalid");
  });
});
