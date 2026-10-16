import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["server/tests/**/*.test.ts", "tools/tests/**/*.test.ts"],
    pool: "forks",
    isolate: true,
  },
});
