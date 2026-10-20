import { signInWithEmailAndPassword, signOut } from "firebase/auth";

import { requireFirebase } from "@/lib/firebase";

/**
 * Helpers for the module integration tests. Everything talks to the local
 * emulators under the offline demo-egso-prims project; the "owner" token
 * below is the emulators' own admin credential and means nothing anywhere
 * else. All records are synthetic.
 */

export const PROJECT_ID = "demo-egso-prims";
const AUTH = "http://127.0.0.1:9099";
const FIRESTORE = "http://127.0.0.1:8085";
const PASSWORD = "test-password-1";

function assertEmulatorTarget() {
  const { app } = requireFirebase();
  if (app.options.projectId !== PROJECT_ID) {
    throw new Error(`Integration tests run only against ${PROJECT_ID}; refusing to run.`);
  }
}

const clearFirestore = () =>
  fetch(`${FIRESTORE}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" });

/** How many audit entries exist, read with the emulator's own admin token. */
async function auditCount(): Promise<number> {
  const res = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT_ID}/databases/(default)/documents/audit_logs?pageSize=300`,
    { headers: { Authorization: "Bearer owner" } },
  );
  const body = (await res.json()) as { documents?: unknown[] };
  return body.documents?.length ?? 0;
}

/**
 * Empties Firestore and Auth in the emulators. Clearing deletes the previous
 * test's records, and the recordEvents function audits each deletion a
 * moment later, so the clear is repeated once those late entries have
 * stopped arriving. The second clear removes only audit entries,
 * notifications and counters, which the function ignores, so nothing is
 * left over for the next test.
 */
export async function resetEmulators(): Promise<void> {
  assertEmulatorTarget();
  await signOut(requireFirebase().auth);
  await clearFirestore();
  let last = -1;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const count = await auditCount();
    if (count === last) break;
    last = count;
  }
  await clearFirestore();
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
}

/**
 * A staff account with the given role, as setStaffRole would leave it.
 * Signs up through the Auth emulator (so the office-email check runs), then
 * sets the custom claims with the emulator's admin endpoint.
 */
export async function createStaff(
  email: string,
  role: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const signUp = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  const { localId } = (await signUp.json()) as { localId: string };
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ localId, customAttributes: JSON.stringify({ role, ...extra }) }),
  });
  return localId;
}

/** Signs the app in as that account, as the login page will. */
export async function signInAs(email: string): Promise<void> {
  const { auth } = requireFirebase();
  await signOut(auth);
  await signInWithEmailAndPassword(auth, email, PASSWORD);
}

/** Back to a signed-out visitor, as on the public portal. */
export async function signOutToPublic(): Promise<void> {
  await signOut(requireFirebase().auth);
}

/** The standard cast: one account per role, created after each reset. */
export async function createTeam() {
  await createStaff("admin@alaminos.gov.ph", "Administrator");
  await createStaff("dept@alaminos.gov.ph", "Department User");
  await createStaff("approver@alaminos.gov.ph", "Department User", { approver: true });
  await createStaff("viewer@alaminos.gov.ph", "Viewer");
}

export const manilaYear = () =>
  new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric" }).format(new Date());

/** A small synthetic PDF the upload pickers would accept. */
export const samplePdf = (name = "quotation.pdf") =>
  new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], name, { type: "application/pdf" });
