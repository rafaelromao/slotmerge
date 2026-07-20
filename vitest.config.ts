import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      APP_ENV: "test",
      DATABASE_URL: "postgres://slotmerge:slotmerge@localhost:5432/slotmerge",
    },
    globals: true,
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "scripts/**/*.test.ts",
      "scripts/**/*.test.tsx",
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
    ],
    exclude: ["tests/helpers/**/*.test.ts", "tests/e2e/**/*.test.ts"],
  },
});
