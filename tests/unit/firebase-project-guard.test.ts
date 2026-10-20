import { deleteApp, getApps } from "firebase/app";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * src/lib/firebase.ts must refuse every Firebase project except GSO PRIMS
 * and offline emulator projects, before any SDK object exists. The check runs
 * on the first getFirebase() call. Nothing here contacts a server: creating
 * the SDK objects makes no network request.
 */

const load = async (env: Record<string, string>) => {
  vi.resetModules();
  vi.unstubAllEnvs();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import("../../src/lib/firebase");
};

const base = {
  VITE_FIREBASE_API_KEY: "test-key",
  VITE_FIREBASE_AUTH_DOMAIN: "test.firebaseapp.com",
  VITE_FIREBASE_STORAGE_BUCKET: "test.appspot.com",
  VITE_FIREBASE_APP_ID: "test-app",
};

afterEach(async () => {
  vi.unstubAllEnvs();
  // The SDK keeps one registry of apps for the whole test run.
  await Promise.all(getApps().map((app) => deleteApp(app)));
});

describe("Firebase project guard", () => {
  it("refuses the municipality's live project by name", async () => {
    expect((await load({ ...base, VITE_FIREBASE_PROJECT_ID: "alaminos-municipality" })).getFirebase).toThrow(/off-limits/);
  });

  it("refuses the retired development project by name", async () => {
    expect((await load({ ...base, VITE_FIREBASE_PROJECT_ID: "egso-2k26" })).getFirebase).toThrow(/off-limits/);
  });

  it("refuses both prohibited projects even with the emulators on", async () => {
    for (const id of ["alaminos-municipality", "egso-2k26"]) {
      const m = await load({ ...base, VITE_FIREBASE_PROJECT_ID: id, VITE_FIREBASE_USE_EMULATORS: "true" });
      expect(m.getFirebase).toThrow(/off-limits/);
    }
  });

  it("refuses look-alikes and other projects", async () => {
    for (const id of ["egso-b2c0a-copy", "EGSO-B2C0A", "egso", "some-other-project"]) {
      expect((await load({ ...base, VITE_FIREBASE_PROJECT_ID: id })).getFirebase).toThrow(/not GSO PRIMS/);
    }
  });

  it("refuses a demo project unless the emulators are on", async () => {
    expect((await load({ ...base, VITE_FIREBASE_PROJECT_ID: "demo-egso-prims" })).getFirebase).toThrow(/Emulator Suite/);
  });

  it("accepts the emulator project with the emulators on", async () => {
    const m = await load({
      ...base,
      VITE_FIREBASE_PROJECT_ID: "demo-egso-prims",
      VITE_FIREBASE_USE_EMULATORS: "true",
    });
    expect(m.getFirebase()?.app.options.projectId).toBe("demo-egso-prims");
  });

  it("accepts egso-b2c0a", async () => {
    const m = await load({ ...base, VITE_FIREBASE_PROJECT_ID: "egso-b2c0a" });
    expect(m.getFirebase()?.app.options.projectId).toBe("egso-b2c0a");
  });

  it("stays switched off when no project is configured", async () => {
    const m = await load({ VITE_FIREBASE_API_KEY: "", VITE_FIREBASE_PROJECT_ID: "", VITE_FIREBASE_APP_ID: "" });
    expect(m.getFirebase()).toBeNull();
    expect(m.isFirebaseConfigured).toBe(false);
  });
});
