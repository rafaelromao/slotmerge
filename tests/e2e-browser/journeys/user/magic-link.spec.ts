import { test, expect, type Browser } from "@playwright/test";
import { createMagicLinkTokenIssuer } from "../../../../src/auth/magic-link";
import { captureState } from "../../../helpers/playwright/screenshot-helper";

const BASE_URL = "http://localhost:3000";
const INVITED_EMAIL = "magic-link-journey@example.com";
const RESEND_EMAIL = "magic-link-resend-journey@example.com";
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

async function adminInvite(browser: Browser, email: string): Promise<void> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    storageState: "playwright/.auth/admin.json",
  });
  const page = await context.newPage();
  await page.goto("/admin");
  await page.evaluate(
    ({ inviteEmail }) => {
      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/admin/invites";
      for (const [name, value] of Object.entries({
        _csrf: "csrf-admin-test",
        email: inviteEmail,
        role: "user",
      })) {
        const input = document.createElement("input");
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    },
    { inviteEmail: email },
  );
  await page.waitForURL((url) => url.pathname === "/admin");
  expect(await waitForInvitePayload(email)).not.toBeNull();
  await context.close();
}

async function waitForInvitePayload(
  email: string,
  timeoutMs = 10000,
): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { emails } = await getCapturedEmails(email);
    const invite = emails.filter((item) => item.type === "invite").at(-1);
    if (invite) {
      return invite.payload;
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
  test.describe.configure({ mode: "serial" });

  test("happy path: Admin invite → public /sign-in form → sent → verify → setup checklist", async ({
    browser,
    page,
  }) => {
    await adminInvite(browser, INVITED_EMAIL);
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

    await page.goto(absoluteMagicLinkUrl);
    await page.waitForURL(
      (url) =>
        url.pathname === "/sign-in/verify" &&
        url.searchParams.get("error") === "link_used",
    );
    await expect(page.getByTestId("verify-error-link_used")).toBeVisible();
    const requestNewLink = page.getByTestId(
      "verify-request-new-link-link_used",
    );
    await expect(requestNewLink).toHaveAttribute(
      "href",
      `/sign-in?email=${encodeURIComponent(INVITED_EMAIL)}`,
    );
    await captureState(page, "sign-in", "verify-error-used");
  });

  test("waiting past expiry returns link_expired and resends through the typed screen", async ({
    browser,
    page,
  }) => {
    await adminInvite(browser, RESEND_EMAIL);
    const payload = await waitForInvitePayload(RESEND_EMAIL);
    expect(payload).not.toBeNull();
    const inviteId = payload?.["inviteId"];
    expect(typeof inviteId).toBe("string");
    const expired = createMagicLinkTokenIssuer({
      clock: { now: () => new Date("2026-07-12T10:00:00.000Z") },
      baseUrl: BASE_URL,
      secret: "local-magic-link-secret-do-not-use-in-production",
    }).issueMagicLinkToken({
      inviteId: inviteId as string,
      email: RESEND_EMAIL,
      expiresAt: new Date("2026-07-12T11:59:00.000Z"),
      generation: 0,
    });

    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });
    await page.goto(expired.magicLinkUrl);
    await page.waitForURL(
      (url) =>
        url.pathname === "/sign-in/verify" &&
        url.searchParams.get("error") === "link_expired",
    );
    await expect(page.getByTestId("verify-error-link_expired")).toBeVisible();
    await expect(
      page.getByTestId("verify-request-new-link-link_expired"),
    ).toHaveAttribute(
      "href",
      `/sign-in?email=${encodeURIComponent(RESEND_EMAIL)}`,
    );
    await captureState(page, "sign-in", "verify-error-expired");

    await page.getByRole("button", { name: "Send a new link" }).click();
    await expect(
      page.getByRole("heading", { name: "Check your email" }),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(RESEND_EMAIL);
  });

  test("a malformed token returns link_invalid with a Request a new link link", async ({
    page,
  }) => {
    await page.goto("/sign-in/verify?token=not-a-real-token");
    await page.waitForURL(
      (url) =>
        url.pathname === "/sign-in/verify" &&
        url.searchParams.get("error") === "link_invalid",
    );
    await expect(page.getByTestId("verify-error-link_invalid")).toBeVisible();
    await expect(
      page.getByTestId("verify-request-new-link-link_invalid"),
    ).toHaveAttribute("href", "/sign-in");
    await captureState(page, "sign-in", "verify-error-invalid");
  });
});
