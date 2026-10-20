import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests (tests/unit) and security rules tests (tests/rules). The rules
// tests need the Firestore and Storage emulators, so run them with
// `npm run test:rules`, which starts both first. Module integration tests
// have their own config: vitest.integration.config.ts.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/rules/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 15000,
  },
});
