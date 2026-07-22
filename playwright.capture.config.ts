import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

export default defineConfig({
  ...baseConfig,
  projects: [
    {
      name: "capture",
      use: {
        ...baseConfig.projects![1].use,
      },
      snapshotDir: "./tests/e2e-browser/screenshots",
    },
  ],
});
