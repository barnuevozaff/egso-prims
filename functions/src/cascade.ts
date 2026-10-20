import { getFirestore } from "firebase-admin/firestore";
import { onDocumentDeleted } from "firebase-functions/v2/firestore";

/**
 * Cascading deletes — the `on delete cascade` foreign keys of the Postgres
 * schema. Firestore has no foreign keys, so deleting a parent document here
 * deletes the children that name it. Grandchildren follow because each child
 * deletion fires this trigger again (an energy account removes its submeters,
 * each submeter removes its bills).
 *
 * Records Management's one `on delete restrict` key (a box with contents
 * cannot be deleted) is a check the app makes before deleting, not a cascade.
 */

export const CASCADES: Record<string, { collection: string; field: string }[]> = {
  energy_accounts: [
    { collection: "energy_bills", field: "account_id" },
    { collection: "energy_submeters", field: "account_id" },
  ],
  energy_submeters: [{ collection: "energy_submeter_bills", field: "submeter_id" }],
  water_accounts: [
    { collection: "water_bills", field: "account_id" },
    { collection: "water_submeters", field: "account_id" },
  ],
  water_submeters: [
    { collection: "water_submeter_bills", field: "submeter_id" },
    { collection: "water_meter_readings", field: "submeter_id" },
  ],
  fuel_vehicles: [
    { collection: "fuel_transactions", field: "vehicle_id" },
    { collection: "fuel_odometer_readings", field: "vehicle_id" },
    { collection: "fuel_trips", field: "vehicle_id" },
  ],
  violators: [{ collection: "violations", field: "violator_id" }],
};

/** Firestore commits at most 500 writes per batch. */
const BATCH = 400;

export async function deleteChildren(parentCollection: string, parentId: string): Promise<number> {
  const db = getFirestore();
  let deleted = 0;
  for (const child of CASCADES[parentCollection] ?? []) {
    for (;;) {
      const page = await db
        .collection(child.collection)
        .where(child.field, "==", parentId)
        .limit(BATCH)
        .get();
      if (page.empty) break;
      const batch = db.batch();
      page.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deleted += page.size;
    }
  }
  return deleted;
}

export const cascadeDeletes = onDocumentDeleted("{collection}/{docId}", async (event) => {
  const { collection, docId } = event.params;
  if (!CASCADES[collection]) return;
  await deleteChildren(collection, docId);
});
