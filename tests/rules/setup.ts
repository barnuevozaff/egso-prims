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

/** Claims as the Admin SDK would set them; email matches the office domain. */
export const staff = {
  admin: { uid: "admin-1", token: { role: "Administrator", email: "admin@alaminos.gov.ph" } },
  dept: { uid: "dept-1", token: { role: "Department User", email: "dept@alaminos.gov.ph" } },
  viewer: { uid: "viewer-1", token: { role: "Viewer", email: "viewer@alaminos.gov.ph" } },
  noRole: { uid: "norole-1", token: { email: "new@alaminos.gov.ph" } },
  madeUpRole: { uid: "fake-1", token: { role: "Superuser", email: "x@alaminos.gov.ph" } },
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
  // Raised by the Department User test account, who therefore owns it.
  created_by_uid: "dept-1",
  created_at: "2026-10-19T00:00:00.000Z",
  updated_at: "2026-10-19T00:00:00.000Z",
});
