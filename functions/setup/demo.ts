/**
 * Demo accounts and settings for testing EGSO-PRIMS by hand on the local
 * Emulator Suite. EMULATOR ONLY: it points the Admin SDK at the emulators on
 * this computer itself (whatever the shell says) and always uses the offline
 * demo-egso-prims project — it cannot reach egso-b2c0a or any other project.
 *
 * With `npm run demo:emulators` running, in a second terminal:
 *   npm run demo:setup
 *
 * Also sets the PR and PO signatories' printed names from the official templates where none are set.
 *
 * Safe to run again: the demo account gets its demo password back, and
 * settings already present are left as they are.
 *
 * Like every account, the demo account is an Administrator (29 Oct 2026). The
 * password is a demo password for a synthetic account. It is not, and must
 * never become, a real one; real accounts are added in the Firebase console.
 */
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import { seedSettings } from "./provision.ts";

const PROJECT_ID = "demo-egso-prims";
export const DEMO_PASSWORD = "demo-only-2026";

// Ports from the "emulators" block in firebase.json. Set here, not taken from
// the shell, so a stray variable or credential can never send this elsewhere.
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8085";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

try {
  await fetch("http://127.0.0.1:4400/emulators");
} catch {
  console.error("The emulators are not running. Start them first: npm run demo:emulators");
  process.exit(2);
}

export const DEMO_ACCOUNT = { email: "demo.admin@alaminos.gov.ph", name: "Demo Administrator" };

/** Synthetic office particulars, plainly marked so no printout passes for real. */
const DEMO_SETTINGS = {
  organization_name: "Municipality of Alaminos, Laguna",
  office_name: "General Services Office",
  province: "Laguna",
  municipality_address: "DEMO ADDRESS — local testing only",
  contact_number: "DEMO 0000-000-0000",
  official_email: "demo.gso@alaminos.gov.ph",
  currency: "PHP",
  padding_length: 6,
  year_reset: true,
  separator: "-",
};

process.env.GCLOUD_PROJECT = PROJECT_ID;
process.env.METADATA_SERVER_DETECTION = "none";
initializeApp({ projectId: PROJECT_ID });
const auth = getAuth();
const db = getFirestore();

// As Authentication → Users → Add user leaves an account: email and password, no claims.
const existing = await auth.getUserByEmail(DEMO_ACCOUNT.email).catch(() => null);
if (existing) await auth.updateUser(existing.uid, { password: DEMO_PASSWORD, displayName: DEMO_ACCOUNT.name });
else await auth.createUser({ email: DEMO_ACCOUNT.email, password: DEMO_PASSWORD, displayName: DEMO_ACCOUNT.name });
console.log(`${existing ? "Updated" : "Created"} ${DEMO_ACCOUNT.email} (Administrator)`);
const s = await seedSettings(db, DEMO_SETTINGS, "demo-setup");

/*
 * The printed names on the office's own PR and PO templates (21 Oct 2026),
 * as the demo's starting signatories. Taken from the templates, NOT verified
 * as today's officeholders: the municipality confirms them before real use.
 *
 * Written where a name is missing, or where it still holds the setup's own
 * placeholder ("DEMO …", written by this script and never changed since).
 * A name an Administrator saved is kept. Approved documents keep the names
 * copied onto them either way.
 */
const TEMPLATE_NAMES: [category: string, key: string, name: string][] = [
  ["Signatories", "pr_requested_by_name", "FLORENTINO J. DESTACAMENTO"],
  ["Signatories", "pr_cash_availability_name", "ROWENA C. LANDICHO"],
  ["Signatories", "pr_approved_by_name", "Hon. ERICSON R. LOPEZ"],
  ["PO Signatories", "po_approving_name", "ERICSON R. LOPEZ"],
  ["PO Signatories", "po_bac_secretary_name", "NEMIA B. MONZONES"],
];
for (const [category, key, name] of TEMPLATE_NAMES) {
  const id = `cfg-${category.toLowerCase().replace(/\s+/g, "-")}-${key.replace(/_/g, "-")}`;
  const ref = db.collection("system_configuration").doc(id);
  const snap = await ref.get();
  const placeholder =
    snap.exists && snap.get("updated_by_uid") === "demo-setup" && /^DEMO /.test(String(snap.get("value") ?? ""));
  if (snap.exists && !placeholder) {
    console.log(`Signatory kept (set by an Administrator): ${key} = ${String(snap.get("value"))}`);
    continue;
  }
  const at = new Date().toISOString();
  await ref.set({
    id,
    category,
    key,
    value: name,
    description: "From the official template; to be verified by the municipality",
    created_at: snap.exists ? snap.get("created_at") : at,
    updated_at: at,
    created_by_uid: snap.exists ? snap.get("created_by_uid") : "demo-setup",
    updated_by_uid: "demo-setup",
  });
  console.log(`Signatory ${snap.exists ? "updated from the placeholder" : "set"}: ${key} = ${name}`);
}
console.log(`Settings written: ${s.written.join(", ") || "none"}; kept: ${s.kept.join(", ") || "none"}`);
console.log(`Demo password: ${DEMO_PASSWORD}`);
process.exit(0);
