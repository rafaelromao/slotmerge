import { test, expect } from "@playwright/test";

test.describe("Role guard journey", () => {
  test.describe.configure({ mode: "serial" });

  test("a plain User sees per-segment not-found for /searches", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: "playwright/.auth/user.json",
    });
    const page = await context.newPage();
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });

    await page.goto("/searches");

    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to Home" })).toBeVisible();

    await context.close();
  });

  test("a plain User sees per-segment not-found for /admin", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: "playwright/.auth/user.json",
    });
    const page = await context.newPage();
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });

    await page.goto("/admin");

    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();

    await context.close();
  });

  test("an Organizer sees the Search form at /searches", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: "playwright/.auth/organizer.json",
    });
    const page = await context.newPage();
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });

    await page.goto("/searches");

    await expect(page.getByRole("heading", { name: "Search" })).toBeVisible();

    await context.close();
  });

  test("an Organizer sees per-segment not-found for /admin", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: "playwright/.auth/organizer.json",
    });
    const page = await context.newPage();
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });

    await page.goto("/admin");

    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();

    await context.close();
  });

  test("an Admin sees the Admin page at /admin", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: "playwright/.auth/admin.json",
    });
    const page = await context.newPage();
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });

    await page.goto("/admin");

    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();

    await context.close();
  });

  test("an unauthenticated visitor to /admin is redirected to /sign-in with returnTo", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });

    await page.goto("/admin");

    await page.waitForURL((url) => {
      return (
        url.pathname === "/sign-in" &&
        url.searchParams.get("returnTo") === "/admin"
      );
    });

    await context.close();
  });

  test("an unauthenticated visitor to /searches is redirected to /sign-in with returnTo", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });

    await page.goto("/searches");

    await page.waitForURL((url) => {
      return (
        url.pathname === "/sign-in" &&
        url.searchParams.get("returnTo") === "/searches"
      );
    });

    await context.close();
  });
});
