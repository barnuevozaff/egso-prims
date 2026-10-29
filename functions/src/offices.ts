import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { PUBLIC_CALLABLE, callerOf, enforcePublicLimit, requireRole } from "./documents/caller.js";
import { record } from "./documents/validate.js";

/**
 * The office directory (29 Oct 2026): the one list of municipal offices every
 * Office / Department field offers, on the admin site and on the public
 * portal. It lives in Firestore (offices/{id}); administrators add, rename
 * and remove offices in Settings → Office / Department Management.
 *
 * A record keeps the office's name as it was when it was filed
 * (department_code, office_code), so renaming or removing an office never
 * changes a document already made. Removing an office only takes it off the
 * lists (active: false); its document stays.
 *
 * Names are unique, ignoring letter case and spacing: each active office
 * claims office_names/{key}, created and released in the same transaction as
 * the change. Browsers read nothing here directly except staff reading
 * offices; the public portal gets the active names from listOffices, and
 * only manageOffice writes.
 */

/** The official list (29 Oct 2026), in its order. Written once, on first use — never again. */
export const OFFICIAL_OFFICES = [
  "Office of the Municipal Accountant",
  "Office of the Municipal Agriculturist",
  "Office of the Municipal Assessor",
  "Bids and Awards Committee",
  "Bureau of Fire Protection",
  "Business Permit and Licensing Office",
  "Office of the Municipal Budget Officer",
  "Office of the Municipal Building Official",
  "Department of the Interior and Local Government",
  "Office of the Municipal Engineer",
  "General Services Office",
  "Human Resource Management Office",
  "Local Youth Development Office",
  "Office of the Municipal Mayor",
  "Office of the Municipal Civil Registrar",
  "Municipal Disaster Risk Reduction and Management Office",
  "Municipal Environment and Natural Resources Office",
  "Office of the Municipal Planning and Development Coordinator",
  "Office of the Municipal Treasurer",
  "Municipal Social Welfare and Development Office",
  "Public Employment Service Office",
  "Philippine National Police",
  "Persons with Disability Affairs Office",
  "Rural Health Unit",
  "Sangguniang Bayan",
  "Office of the Secretary to the Sangguniang Bayan",
  "Municipal Tourism Office",
  "Office of the Municipal Vice Mayor",
  "Public Market",
  "Office of the Municipal Administrator",
  "Materials Recovery Facility",
];

export interface Office {
  id: string;
  name: string;
}

const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

/** Two names are the same office when they match ignoring case and spacing. */
export const officeKey = (name: string) => tidy(name).toLowerCase();

/** "/" cannot appear in a document ID; it is written %2F, as unique_keys does. */
const claimId = (name: string) => officeKey(name).replace(/\//g, "%2F");

export function cleanOfficeName(raw: unknown): string {
  const name = typeof raw === "string" ? tidy(raw) : "";
  if (name.length < 2) throw new HttpsError("invalid-argument", "Enter the office's name.");
  if (name.length > 120) throw new HttpsError("invalid-argument", "An office's name is at most 120 characters.");
  return name;
}

/** Who wrote the official list, as the audit trail names it. */
const SEED_ACTOR = "office-directory-setup";

/**
 * Writes the official list once. The marker document records that it was
 * done, so a later deploy or call never brings back a removed office or
 * overwrites a renamed one. Simultaneous first calls queue on the marker.
 */
export async function ensureSeeded(db: Firestore): Promise<void> {
  const marker = db.doc("office_directory/seed");
  if ((await marker.get()).exists) return;
  await db.runTransaction(async (tx) => {
    if ((await tx.get(marker)).exists) return;
    const at = new Date().toISOString();
    OFFICIAL_OFFICES.forEach((name, i) => {
      const ref = db.collection("offices").doc();
      tx.create(ref, {
        id: ref.id,
        name,
        name_key: officeKey(name),
        sort_order: i + 1,
        active: true,
        created_at: at,
        updated_at: at,
        created_by_uid: SEED_ACTOR,
        updated_by_uid: SEED_ACTOR,
      });
      tx.create(db.collection("office_names").doc(claimId(name)), { office_id: ref.id, created_at: at });
    });
    tx.create(marker, { seeded_at: at, count: OFFICIAL_OFFICES.length });
  });
}

/** The active offices, in their order. */
export async function activeOffices(db: Firestore): Promise<Office[]> {
  const snap = await db.collection("offices").where("active", "==", true).get();
  return snap.docs
    .map((d) => ({ id: d.id, name: String(d.get("name") ?? ""), order: Number(d.get("sort_order") ?? 0) }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map(({ id, name }) => ({ id, name }));
}

/** The active offices' names, for every office field. Public: the portal's forms need it signed out. */
export const listOffices = onCall(PUBLIC_CALLABLE, async (request): Promise<Office[]> => {
  if ((await callerOf(request)).kind === "public") await enforcePublicLimit(request, "suggest");
  const db = getFirestore();
  await ensureSeeded(db);
  return activeOffices(db);
});

/**
 * Adds, renames or removes an office (Settings → Office / Department
 * Management). Every account is an Administrator, and every account may.
 * Returns the active list as it stands afterwards.
 */
export const manageOffice = onCall(async (request): Promise<Office[]> => {
  const caller = await callerOf(request);
  requireRole(caller, ["Administrator"], "change the office list");
  const uid = caller.kind === "staff" ? caller.uid : "";
  const data = record(request.data ?? {});
  const db = getFirestore();
  await ensureSeeded(db);
  const at = new Date().toISOString();
  const offices = db.collection("offices");
  const claims = db.collection("office_names");
  const taken = (name: string) => new HttpsError("already-exists", `“${name}” is already on the office list.`);
  const gone = () => new HttpsError("not-found", "That office is no longer on the list. Reload the page.");

  if (data.action === "add") {
    const name = cleanOfficeName(data.name);
    await db.runTransaction(async (tx) => {
      const claim = claims.doc(claimId(name));
      if ((await tx.get(claim)).exists) throw taken(name);
      const last = await tx.get(offices.orderBy("sort_order", "desc").limit(1));
      const ref = offices.doc();
      tx.create(claim, { office_id: ref.id, created_at: at });
      tx.create(ref, {
        id: ref.id,
        name,
        name_key: officeKey(name),
        // A new office goes to the end of the list.
        sort_order: (last.empty ? 0 : Number(last.docs[0].get("sort_order") ?? 0)) + 1,
        active: true,
        created_at: at,
        updated_at: at,
        created_by_uid: uid,
        updated_by_uid: uid,
      });
    });
  } else if (data.action === "rename") {
    const id = typeof data.id === "string" ? data.id : "";
    const name = cleanOfficeName(data.name);
    await db.runTransaction(async (tx) => {
      const ref = offices.doc(id || "-");
      const office = await tx.get(ref);
      if (!office.exists || office.get("active") !== true) throw gone();
      const before = String(office.get("name") ?? "");
      if (officeKey(before) !== officeKey(name)) {
        const claim = claims.doc(claimId(name));
        if ((await tx.get(claim)).exists) throw taken(name);
        tx.create(claim, { office_id: id, created_at: at });
        tx.delete(claims.doc(claimId(before)));
      }
      tx.update(ref, { name, name_key: officeKey(name), updated_at: at, updated_by_uid: uid });
    });
  } else if (data.action === "remove") {
    const id = typeof data.id === "string" ? data.id : "";
    await db.runTransaction(async (tx) => {
      const ref = offices.doc(id || "-");
      const office = await tx.get(ref);
      if (!office.exists) throw gone();
      if (office.get("active") !== true) return;
      const left = await tx.get(offices.where("active", "==", true).limit(2));
      if (left.size < 2) throw new HttpsError("failed-precondition", "Keep at least one office on the list.");
      // Off the lists, never deleted: documents filed under it keep its name.
      tx.update(ref, { active: false, removed_at: at, removed_by_uid: uid, updated_at: at, updated_by_uid: uid });
      tx.delete(claims.doc(claimId(String(office.get("name") ?? ""))));
    });
  } else {
    throw new HttpsError("invalid-argument", "Choose add, rename or remove.");
  }
  return activeOffices(db);
});
