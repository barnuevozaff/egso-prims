import path from "node:path";
import { defineConfig } from "vitest/config";

// Module integration tests (tests/integration): the app's own data layer,
// switched to Firebase, against the Auth, Firestore, Functions and Storage
// emulators. Run with `npm run test:integration`, which starts them first.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
    env: {
      VITE_DATA_BACKEND: "firebase",
      VITE_FIREBASE_USE_EMULATORS: "true",
      VITE_FIREBASE_PROJECT_ID: "demo-egso-prims",
      VITE_FIREBASE_API_KEY: "demo-key",
      VITE_FIREBASE_AUTH_DOMAIN: "demo-egso-prims.firebaseapp.com",
      VITE_FIREBASE_STORAGE_BUCKET: "demo-egso-prims.appspot.com",
      VITE_FIREBASE_APP_ID: "demo-app",
    },
  },
});
