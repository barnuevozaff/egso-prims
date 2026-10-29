import { callFunction } from "@/lib/firestore";

/**
 * Deleting synthetic purchase requests while developing locally (21 Oct
 * 2026). This is test-data cleanup, not record management: official requests
 * are voided, never deleted.
 *
 * Decided when the app is built: true only on the Vite dev server running
 * against the demo emulators (`npm run dev:emulators`). A production build has
 * DEV false, so the option and its code are left out of it entirely. The
 * deleteDemoPurchaseRequests function also refuses outside the emulator, and
 * firestore.rules refuse every browser delete.
 */
export const DEMO_CLEANUP =
  import.meta.env.DEV &&
  import.meta.env.VITE_DATA_BACKEND === "firebase" &&
  import.meta.env.VITE_FIREBASE_USE_EMULATORS === "true" &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID === "demo-egso-prims";

export interface DemoCleanupResult {
  deleted: string[];
  refused: { id: string; reason: string }[];
}

export async function deleteDemoPurchaseRequests(ids: string[]): Promise<DemoCleanupResult> {
  if (!DEMO_CLEANUP) throw new Error("Deleting test data is available only in the local demo.");
  return callFunction<DemoCleanupResult>("deleteDemoPurchaseRequests", { ids });
}
