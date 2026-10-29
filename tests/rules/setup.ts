import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";

/**
 * Rules tests run only against the local Emulator Suite, under an offline
 * demo-* project ID that cannot reach any real Firebase project. Ports match
 * firebase.json. Every record here is synthetic.
 */
export const PROJECT_ID = "demo-egso-prims";

export function createEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: "127.0.0.1",
      port: 8085,
      rules: readFileSync(resolve(import.meta.dirname, "../../firestore.rules"), "utf8"),
    },
    storage: {
      host: "127.0.0.1",
      port: 9199,
      rules: readFileSync(resolve(import.meta.dirname, "../../storage.rules"), "utf8"),
    },
  });
}

const PASSWORD = { sign_in_provider: "password" } as const;

/**
 * Email-and-password sessions of accounts added in the Firebase console: every
 * one is an Administrator, with no claims (29 Oct 2026). Two, for tests about
 * who did what.
 */
export const staff = {
  admin: { uid: "admin-1", token: { email: "admin@alaminos.gov.ph", firebase: PASSWORD } },
  colleague: { uid: "colleague-1", token: { email: "colleague@gmail.com", firebase: PASSWORD } },
} as const;

export const samplePR = (n = "PR-2026-000001", status = "Submitted") => ({
  id: n,
  pr_number: n,
  department_code: "GSO",
  requester: "Juan Dela Cruz",
  purpose: "Office supplies for Q4 (test data)",
  status,
  items: [],
  approvals: [],
  // Raised by the second test account, who therefore owns it.
  created_by_uid: "colleague-1",
  created_at: "2026-10-19T00:00:00.000Z",
  updated_at: "2026-10-19T00:00:00.000Z",
});
