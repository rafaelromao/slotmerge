import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT ?? 3000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e-browser",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { outputFolder: "playwright/.artifacts/test-results" }], ["list"]],
  globalSetup: path.join(__dirname, "tests/helpers/playwright/global-setup.ts"),

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
      },
      snapshotDir: "./tests/e2e-browser/screenshots",
    },
  ],

  webServer: {
    command: "pnpm local:up",
    url: `${BASE_URL}/api/local/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
