import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
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
      "app/**/*.test.ts",
      "app/**/*.test.tsx",
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
    ],
    exclude: ["tests/helpers/**/*.test.ts", "tests/e2e/**/*.test.ts"],
  },
});
