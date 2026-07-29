import { chromium, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const PORT = 3002;
const BASE_URL = `http://localhost:${PORT}`;
const OUT_DIR = "/tmp/opencode/slotmerge-screens";

async function capture(page: Page, file: string) {
  await page.screenshot({ path: `${OUT_DIR}/${file}`, fullPage: true });
}

async function withPage(storage: string, run: (page: Page) => Promise<void>) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    baseURL: BASE_URL,
    storageState: storage,
  });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });
  try {
    await run(page);
  } finally {
    await browser.close();
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  // Public surfaces.
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ baseURL: BASE_URL });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/sign-in");
  await capture(page, "public-sign-in.png");
  await page.goto("/sign-in/sent?email=j%40example.com");
  await capture(page, "public-sign-in-sent.png");
  await page.goto("/sign-in/verify?error=link_used&email=j%40example.com");
  await capture(page, "public-sign-in-verify-error.png");
  await browser.close();

  // User surfaces.
  await withPage("playwright/.auth/user.json", async (page) => {
    await page.goto("/");
    await capture(page, "user-home.png");
    await page.goto("/me");
    await capture(page, "user-me.png");
    await page.goto("/me/profile");
    await capture(page, "user-me-profile.png");
    await page.goto("/me/topics");
    await capture(page, "user-me-topics.png");
    await page.goto("/me/discoverability");
    await capture(page, "user-me-discoverability.png");
    await page.goto("/me/availability");
    await capture(page, "user-me-availability.png");
    await page.goto("/me/calendar-connections");
    await capture(page, "user-me-calendar-connections.png");
  });

  // Organizer surfaces.
  await withPage("playwright/.auth/organizer.json", async (page) => {
    await page.goto("/");
    await capture(page, "organizer-home.png");
    await page.goto("/searches");
    await capture(page, "organizer-searches.png");
    await page.goto("/searches/history");
    await capture(page, "organizer-search-history.png");
  });

  // Admin surfaces.
  await withPage("playwright/.auth/admin.json", async (page) => {
    await page.goto("/admin");
    await capture(page, "admin-home.png");
    await page.goto("/admin/users");
    await capture(page, "admin-users.png");
    await page.goto("/admin/topics");
    await capture(page, "admin-topics.png");
    await page.goto("/admin/status");
    await capture(page, "admin-status.png");
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});