import { test, expect } from "@playwright/test";
import { captureState } from "../../../helpers/playwright/screenshot-helper";

test.describe("Role guard journey", () => {
  test.describe.configure({ mode: "serial" });

  test("a plain User sees per-segment not-found for /searches", async ({
    page,
  }) => {
    test.use({ storageState: "playwright/.auth/user.json" });
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });

    await page.goto("/searches");

    await expect(
      page.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to Home" })).toBeVisible();
  });

  test("a plain User sees per-segment not-found for /admin", async ({
    page,
  }) => {
    test.use({ storageState: "playwright/.auth/user.json" });
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });

    await page.goto("/admin");

    await expect(
      page.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible();
  });

  test("an Organizer sees the Search form at /searches", async ({ page }) => {
    test.use({ storageState: "playwright/.auth/organizer.json" });
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });

    await page.goto("/searches");

    await expect(page.getByRole("heading", { name: "Search" })).toBeVisible();
  });

  test("an Organizer sees per-segment not-found for /admin", async ({
    page,
  }) => {
    test.use({ storageState: "playwright/.auth/organizer.json" });
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });

    await page.goto("/admin");

    await expect(
      page.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible();
  });

  test("an Admin sees the Admin page at /admin", async ({ page }) => {
    test.use({ storageState: "playwright/.auth/admin.json" });
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });

    await page.goto("/admin");

    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
    await captureState(page, "admin", "role-guard-admin");
  });

  test("an unauthenticated visitor to /admin is redirected to /sign-in with returnTo", async ({
    page,
    request,
  }) => {
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });

    const response = await request.get("/admin", { maxRedirects: 0 });
    expect(response.status()).toBe(303);
    const location = response.headers()["location"];
    expect(location).toContain("/sign-in");
    expect(location).toContain("returnTo=%2Fadmin");
  });

  test("an unauthenticated visitor to /searches is redirected to /sign-in with returnTo", async ({
    request,
  }) => {
    const response = await request.get("/searches", { maxRedirects: 0 });
    expect(response.status()).toBe(303);
    const location = response.headers()["location"];
    expect(location).toContain("/sign-in");
    expect(location).toContain("returnTo=%2Fsearches");
  });
});
