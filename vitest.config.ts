import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      APP_ENV: "test",
      DATABASE_URL: "postgres://slotmerge:slotmerge@localhost:5432/slotmerge",
    },
    globals: true,
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts", "tests/**/*.test.ts"],
  },
});