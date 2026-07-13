import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      APP_ENV: "test",
      DATABASE_URL: "postgres://slotmerge:slotmerge@localhost:5432/slotmerge",
    },
    globals: true,
    include: ["tests/e2e/**/*.test.ts"],
    setupFiles: ["tests/e2e/setup.ts"],
  },
});
