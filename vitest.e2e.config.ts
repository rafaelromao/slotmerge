import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      APP_ENV: "test",
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgres://slotmerge:slotmerge@localhost:5432/slotmerge",
    },
    globals: true,
    include: ["tests/e2e/**/*.test.ts"],
    exclude: [],
    fileParallelism: false,
    globalSetup: ["./tests/helpers/global-setup.ts"],
    setupFiles: ["./tests/helpers/setup.ts"],
    fileParallelism: false,
  },
});