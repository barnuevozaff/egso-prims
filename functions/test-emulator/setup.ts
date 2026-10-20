import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/**
 * These tests write to Firestore through the Admin SDK, which bypasses
 * security rules. They must never reach a real project, so they refuse to
 * start unless the Firestore emulator is the target and the project is the
 * offline demo project. Run them with `npm run test:functions:emulator`.
 */
export const PROJECT_ID = "demo-egso-prims";

export function connect() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
    throw new Error("FIRESTORE_EMULATOR_HOST must point at the local emulator; refusing to run.");
  }
  process.env.GCLOUD_PROJECT = PROJECT_ID;
  // Without this, Google's auth library probes the Cloud metadata server
  // (metadata.google.internal) to see whether it runs on Google Cloud. The
  // emulators need no credentials, so the probe is pointless network traffic.
  process.env.METADATA_SERVER_DETECTION = "none";
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
  return getFirestore();
}

export async function clearFirestore() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const res = await fetch(
    `http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`Could not clear the emulator: ${res.status}`);
}

export async function disconnect() {
  await Promise.all(getApps().map((app) => deleteApp(app)));
}
