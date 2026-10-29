import type { Firestore } from "firebase-admin/firestore";

/**
 * First-run setup for a fresh EGSO-PRIMS on Firebase: the office's own
 * settings and a check that the database really is fresh.
 *
 * Accounts are not made here: they are added in the Firebase console
 * (Authentication → Users → Add user), and every account is an Administrator
 * (29 Oct 2026; docs/firebase/README.md, "Authentication").
 *
 * Pure Admin SDK work, given a Firestore. The command line (setup/cli.ts)
 * decides where it points; assertSetupTarget is the guard. Tested against the
 * emulators (functions/test-emulator/first-run.emulator.test.ts).
 */

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

/**
 * The printed names on the official Municipality of Alaminos Purchase Request
 * and Purchase Order templates, confirmed by the owner as the initial values
 * (22 Oct 2026). Roles and designations are fixed by the forms
 * (src/features/config/types.ts SIGNATORY_ROLES); only these names are
 * settings, and an Administrator changes them in Settings.
 */
export const TEMPLATE_SIGNATORY_NAMES: { category: "Signatories" | "PO Signatories"; key: string; value: string }[] = [
  { category: "Signatories", key: "pr_requested_by_name", value: "FLORENTINO J. DESTACAMENTO" },
  { category: "Signatories", key: "pr_cash_availability_name", value: "ROWENA C. LANDICHO" },
  { category: "Signatories", key: "pr_approved_by_name", value: "Hon. ERICSON R. LOPEZ" },
  { category: "PO Signatories", key: "po_approving_name", value: "ERICSON R. LOPEZ" },
  { category: "PO Signatories", key: "po_bac_secretary_name", value: "NEMIA B. MONZONES" },
];

/**
 * Saves the template names where Settings has none, in one transaction. A
 * name already set — by an Administrator or an earlier run — is never
 * overwritten. Unstamped, so the audit trail shows a System write rather
 * than someone's Settings save. dryRun reads only and reports what it would do.
 */
export async function seedSignatoryNames(db: Firestore, options: { dryRun: boolean }): Promise<SettingsResult> {
  const result: SettingsResult = { written: [], kept: [] };
  await db.runTransaction(async (tx) => {
    const refs = TEMPLATE_SIGNATORY_NAMES.map((s) => db.collection("system_configuration").doc(settingId(s.category, s.key)));
    const snaps = await Promise.all(refs.map((r) => tx.get(r)));
    const at = new Date().toISOString();
    TEMPLATE_SIGNATORY_NAMES.forEach((s, i) => {
      const current = snaps[i].get("value");
      if (typeof current === "string" && current.trim() !== "") {
        result.kept.push(`${s.key} (${current})`);
        return;
      }
      result.written.push(`${s.key} = ${s.value}`);
      if (options.dryRun) return;
      tx.set(
        refs[i],
        {
          id: refs[i].id,
          category: s.category,
          key: s.key,
          value: s.value,
          description: "Initial value from the official template (22 Oct 2026); change it in Settings.",
          created_at: snaps[i].exists ? snaps[i].get("created_at") ?? at : at,
          updated_at: at,
        },
        { merge: true },
      );
    });
  });
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
