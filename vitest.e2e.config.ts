import { defineConfig } from "vitest/config";

// Browser tests (tests/e2e): the installed Chrome against the app running on
// the emulators. Run with `npm run test:e2e`, which starts the emulators; the
// global setup starts the app.
export default defineConfig({
  test: {
    include: ["tests/e2e/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/e2e/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
