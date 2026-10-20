import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";

/**
 * First-run setup for a fresh EGSO-PRIMS on Firebase: the first
 * Administrator, staff roles while the app has no Users screen, the office's
 * own settings, and a check that the database really is fresh.
 *
 * Pure Admin SDK work, given an Auth and a Firestore. The command line
 * (setup/cli.ts) decides where they point; assertSetupTarget is the guard.
 * Tested against the emulators (functions/test-emulator/first-run.emulator.test.ts).
 *
 * Why a script: roles live in custom claims only the Admin SDK can write, and
 * setStaffRole accepts only a caller who is already an Administrator — so the
 * first one cannot come from the app. Nobody can sign up and give themselves
 * a role (docs/firebase/fresh-start.md).
 */

export const OFFICE_DOMAINS = ["alaminos.gov.ph"];
export const ROLES = ["Administrator", "Department User", "Viewer"] as const;
export type Role = (typeof ROLES)[number];

/** The only remote project this may ever touch, and the two it must never touch. */
export const AUTHORISED_PROJECT = "egso-b2c0a";
export const FORBIDDEN_PROJECTS = ["alaminos-municipality", "egso-2k26"];

const isLocal = (host: string | undefined) => !!host && /^(127\.0\.0\.1|localhost):\d+$/.test(host);

/**
 * Emulator mode: both emulators local and a demo-* project. Remote mode:
 * egso-b2c0a only, named twice (project and confirmation), and no emulator
 * variables set, so a remote run can never be mistaken for a local one.
 */
export function assertSetupTarget(options: { projectId: string; remote: boolean; confirm?: string }): void {
  const { projectId, remote, confirm } = options;
  if (FORBIDDEN_PROJECTS.includes(projectId)) {
    throw new Error(`${projectId} is off-limits. This setup runs only against ${AUTHORISED_PROJECT} or a demo-* emulator project.`);
  }
  if (!remote) {
    if (!projectId.startsWith("demo-")) throw new Error(`Emulator setup runs only under a demo-* project, not ${projectId}.`);
    if (!isLocal(process.env.FIRESTORE_EMULATOR_HOST) || !isLocal(process.env.FIREBASE_AUTH_EMULATOR_HOST)) {
      throw new Error("FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST must point at local emulators.");
    }
    return;
  }
  if (projectId !== AUTHORISED_PROJECT) throw new Error(`Remote setup runs only against ${AUTHORISED_PROJECT}, not ${projectId}.`);
  if (confirm !== AUTHORISED_PROJECT) {
    throw new Error(`A remote run must be confirmed with --confirm-remote ${AUTHORISED_PROJECT}.`);
  }
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Emulator variables are set; unset them for a remote run, or run in emulator mode.");
  }
}

export function isOfficeEmail(email: string): boolean {
  return OFFICE_DOMAINS.includes(email.trim().toLowerCase().split("@")[1] ?? "");
}

export interface Provisioned {
  uid: string;
  email: string;
  role: Role;
  approver: boolean;
  created: boolean;
  /** One-time link the person opens to set their own password. */
  passwordLink: string;
}

async function findUser(auth: Auth, email: string) {
  try {
    return await auth.getUserByEmail(email);
  } catch (e) {
    if ((e as { code?: string }).code === "auth/user-not-found") return null;
    throw e;
  }
}

async function administrators(auth: Auth): Promise<string[]> {
  const out: string[] = [];
  let page: string | undefined;
  do {
    const res = await auth.listUsers(1000, page);
    for (const u of res.users) if (u.customClaims?.role === "Administrator") out.push(u.email ?? u.uid);
    page = res.pageToken;
  } while (page);
  return out;
}

/**
 * Creates (or finds) an office account and sets its role, as setStaffRole
 * does. No password is ever chosen or seen here: the account is created
 * without one, and the person sets it through the returned one-time link.
 * Existing sessions are revoked so the new role applies at once.
 */
export async function provisionAccount(
  auth: Auth,
  input: { email: string; displayName?: string; role: Role; approver?: boolean },
): Promise<Provisioned> {
  const email = input.email.trim().toLowerCase();
  if (!isOfficeEmail(email)) throw new Error(`${email} is not an office address (@${OFFICE_DOMAINS.join(", @")}).`);
  if (!ROLES.includes(input.role)) throw new Error(`Role must be one of ${ROLES.join(", ")}.`);
  const approver = input.approver === true;
  if (approver && input.role !== "Department User") throw new Error("Only a Department User can be made an approver.");

  let user = await findUser(auth, email);
  const created = !user;
  if (!user) user = await auth.createUser({ email, displayName: input.displayName?.trim() || undefined, disabled: false });
  else if (input.displayName?.trim() && user.displayName !== input.displayName.trim()) {
    user = await auth.updateUser(user.uid, { displayName: input.displayName.trim() });
  }
  await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), role: input.role, approver });
  await auth.revokeRefreshTokens(user.uid);
  const passwordLink = await auth.generatePasswordResetLink(email);
  return { uid: user.uid, email, role: input.role, approver, created, passwordLink };
}

/**
 * The first Administrator. Refused when an Administrator already exists
 * under another address, so rerunning first-run setup cannot quietly mint a
 * second one; further Administrators are given the role deliberately
 * (provisionAccount, or setStaffRole by an Administrator).
 */
export async function provisionFirstAdministrator(
  auth: Auth,
  input: { email: string; displayName?: string },
): Promise<Provisioned> {
  const email = input.email.trim().toLowerCase();
  const existing = (await administrators(auth)).filter((e) => e.toLowerCase() !== email);
  if (existing.length) {
    throw new Error(`An Administrator already exists (${existing.join(", ")}). First-run setup makes only the first one.`);
  }
  return provisionAccount(auth, { email, displayName: input.displayName, role: "Administrator" });
}

/* ---------------- settings ---------------- */

/**
 * The settings first-run may write: the office's own particulars, printed on
 * every document, and the numbering format. Everything else keeps the
 * app's built-in default (src/features/config/types.ts) until an
 * Administrator changes it in Settings.
 */
export const FIRST_RUN_SETTINGS: Record<string, { category: string; kind: "text" | "number" | "boolean" }> = {
  organization_name: { category: "General", kind: "text" },
  office_name: { category: "General", kind: "text" },
  province: { category: "General", kind: "text" },
  municipality_address: { category: "General", kind: "text" },
  contact_number: { category: "General", kind: "text" },
  official_email: { category: "General", kind: "text" },
  currency: { category: "General", kind: "text" },
  padding_length: { category: "Document Numbering", kind: "number" },
  year_reset: { category: "Document Numbering", kind: "boolean" },
  separator: { category: "Document Numbering", kind: "text" },
};

/** Same document IDs as the Settings screen (src/features/config/api.firebase.ts). */
export const settingId = (category: string, key: string) =>
  `cfg-${category.toLowerCase().replace(/\s+/g, "-")}-${key.replace(/_/g, "-")}`;

export interface SettingsResult {
  written: string[];
  kept: string[];
}

/**
 * Writes the confirmed settings. An existing value is never overwritten —
 * once the office has changed something in Settings, this leaves it alone.
 */
export async function seedSettings(db: Firestore, values: Record<string, unknown>, by: string): Promise<SettingsResult> {
  const result: SettingsResult = { written: [], kept: [] };
  for (const [key, value] of Object.entries(values)) {
    const def = FIRST_RUN_SETTINGS[key];
    if (!def) throw new Error(`${key} is not a first-run setting (${Object.keys(FIRST_RUN_SETTINGS).join(", ")}).`);
    const ok =
      (def.kind === "text" && typeof value === "string" && value.trim() !== "") ||
      (def.kind === "number" && Number.isInteger(value) && Number(value) > 0 && Number(value) <= 10) ||
      (def.kind === "boolean" && typeof value === "boolean");
    if (!ok) throw new Error(`${key} must be ${def.kind === "number" ? "a whole number from 1 to 10" : `a ${def.kind}`}.`);
  }
  for (const [key, value] of Object.entries(values)) {
    const { category } = FIRST_RUN_SETTINGS[key];
    const id = settingId(category, key);
    await db.runTransaction(async (tx) => {
      const ref = db.collection("system_configuration").doc(id);
      if ((await tx.get(ref)).exists) {
        result.kept.push(key);
        return;
      }
      const at = new Date().toISOString();
      tx.create(ref, {
        id,
        category,
        key,
        value: typeof value === "string" ? value.trim() : value,
        description: "Set at first-run setup",
        created_at: at,
        updated_at: at,
        created_by_uid: by,
        updated_by_uid: by,
      });
      result.written.push(key);
    });
  }
  return result;
}

/* ---------------- fresh-start check ---------------- */

/** Every collection the app keeps records in. Empty in a fresh system. */
export const RECORD_COLLECTIONS = [
  "purchase_requests", "purchase_orders", "ris_requests", "reservations",
  "inventory_items", "stock_card", "suppliers",
  "energy_accounts", "energy_bills", "energy_submeters", "energy_submeter_bills",
  "water_accounts", "water_bills", "water_submeters", "water_submeter_bills", "water_meter_readings",
  "fuel_vehicles", "fuel_transactions", "fuel_odometer_readings", "fuel_trips",
  "violators", "violations",
  "disposition_schedules", "record_series", "inventory_appraisals", "inventory_records",
  "disposal_requests", "disposal_items", "record_shelves", "record_shelf_levels",
  "record_boxes", "record_box_contents", "record_box_positions",
  "notifications", "audit_logs", "document_counters", "unique_keys", "rate_limits",
];

export interface FreshCheck {
  fresh: boolean;
  /** Collections already holding documents, with a count (capped at 1000). */
  notEmpty: Record<string, number>;
  settings: number;
}

/**
 * Whether the database is fresh: no records, no counters, no claims. Number
 * counters are not seeded — each type starts at 000001 when its first
 * document is saved — so an empty document_counters is the expected state.
 */
export async function freshStartCheck(db: Firestore): Promise<FreshCheck> {
  const notEmpty: Record<string, number> = {};
  for (const c of RECORD_COLLECTIONS) {
    const n = (await db.collection(c).limit(1000).count().get()).data().count;
    if (n) notEmpty[c] = n;
  }
  const settings = (await db.collection("system_configuration").count().get()).data().count;
  return { fresh: Object.keys(notEmpty).length === 0, notEmpty, settings };
}
