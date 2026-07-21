import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PORT ?? 3000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e-browser",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { outputFolder: "playwright/.artifacts/test-results" }], ["list"]],

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "default",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "capture",
      use: {
        ...devices["Desktop Chrome"],
        video: "on",
        screenshot: "only-on-failure",
      },
    },
  ],

  webServer: {
    command: "pnpm local:up",
    url: `${BASE_URL}/api/local/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
