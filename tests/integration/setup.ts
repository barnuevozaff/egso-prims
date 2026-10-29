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
 * An account as Firebase console → Authentication → Add user leaves it: an
 * email and a password, no claims. Every account is an Administrator
 * (29 Oct 2026).
 */
export async function createAccount(email: string): Promise<string> {
  const signUp = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  const { localId } = (await signUp.json()) as { localId: string };
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

/** The standard cast, created after each reset: three accounts, all Administrators. */
export async function createTeam() {
  await createAccount("admin@alaminos.gov.ph");
  await createAccount("clerk@alaminos.gov.ph");
  await createAccount("head@alaminos.gov.ph");
  await seedSignatories();
}

/**
 * Synthetic Purchase Request signatories, as an Administrator would set them
 * in Settings → Signatories: approval is refused without them (21 Oct 2026).
 */
export async function seedSignatories() {
  const set = async (key: string, value: string | string[]) => {
    const id = `cfg-signatories-${key.replace(/_/g, "-")}`;
    const v = Array.isArray(value)
      ? { arrayValue: { values: value.map((s) => ({ stringValue: s })) } }
      : { stringValue: value };
    const res = await fetch(`${FIRESTORE}/v1/projects/${PROJECT_ID}/databases/(default)/documents/system_configuration/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
      body: JSON.stringify({ fields: { id: { stringValue: id }, category: { stringValue: "Signatories" }, key: { stringValue: key }, value: v } }),
    });
    if (!res.ok) throw new Error(`Could not set ${key}: ${res.status}`);
  };
  // One General Services Officer for every request (21 Oct 2026), whatever office filed it.
  await set("pr_requested_by_name", "TEST GSO SIGNATORY");
  await set("pr_cash_availability_name", "TEST TREASURER");
  await set("pr_approved_by_name", "TEST MAYOR");
}

export const manilaYear = () =>
  new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric" }).format(new Date());

/** A small synthetic PDF the upload pickers would accept. */
export const samplePdf = (name = "quotation.pdf") =>
  new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], name, { type: "application/pdf" });

/** Firestore REST value for a plain JSON value (test seeding only). */
function restValue(v: unknown): unknown {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(restValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, restValue(x)])) } };
}

/** Writes a document straight into the Firestore emulator, bypassing the rules (test seeding only). */
export async function seedDocument(path: string, data: Record<string, unknown>) {
  const res = await fetch(`${FIRESTORE}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ fields: (restValue(data) as { mapValue: { fields: unknown } }).mapValue.fields }),
  });
  if (!res.ok) throw new Error(`Could not seed ${path}: ${res.status}`);
}

/** An approved purchase request to raise orders from (synthetic). */
export async function seedApprovedPR(prNumber = "PR-2026-000001", over: Record<string, unknown> = {}) {
  await seedDocument(`purchase_requests/${prNumber}`, {
    id: prNumber,
    pr_number: prNumber,
    official_pr_number: "100-2026-000001",
    department_code: "GSO",
    requester: "Juan Dela Cruz",
    purpose: "Bond paper for Q4 reports (test data)",
    funding_source: "General Fund",
    request_date: "2026-10-21",
    status: "Approved",
    items: [{ id: "i1", description: "Bond paper, A4", quantity: 10, unit: "ream", estimatedCost: 250 }],
    approvals: [],
    history: [],
    comments: [],
    attachments: [],
    created_at: "2026-10-21T00:00:00.000Z",
    updated_at: "2026-10-21T00:00:00.000Z",
    ...over,
  });
}

/** Synthetic Purchase Order signatories (Settings → Purchase Order signatories). */
export async function seedPOSignatories() {
  for (const [key, value] of [
    ["po_approving_name", "TEST MAYOR"],
    ["po_bac_secretary_name", "TEST BAC SECRETARY"],
  ]) {
    const id = `cfg-po-signatories-${key.replace(/_/g, "-")}`;
    await seedDocument(`system_configuration/${id}`, { id, category: "PO Signatories", key, value });
  }
}
