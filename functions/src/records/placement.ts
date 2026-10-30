import { randomUUID } from "node:crypto";

import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { callerOf, requireRole } from "../documents/caller.js";
import { record, requiredText, text } from "../documents/validate.js";
import { SPECS } from "./documents.js";
import { contentId, positionId, type DocType } from "./room.js";

/**
 * Placing records in the Records Room by hand (30 Oct 2026).
 *
 * Creating a form and filing it are two acts now: an approved form waits
 * among the Unplaced records until an Administrator places it in a box,
 * chosen by shelf, level and position. A shelf has five levels, A to E, and
 * two box positions on each; shelves from before keep any box standing in a
 * third position until its records are moved, but nothing new goes there.
 *
 * Locations are named by the office (Shelf 1 → "Municipal Records Shelf",
 * Level A → "Administrative Records", Box 1 → "Procurement Archives 2026"),
 * but stored by IDs that never change: a level is `{shelfId}-{A..E}`, a
 * position `{levelId}~{1|2}`, and a box gets its own ID when its position is
 * first used. Renaming moves nothing.
 *
 * Every placement and every move is written to the record's box line, with
 * the move kept in its `moves`, and the audit trail records it from there.
 */

/** The box positions a record is placed in: two per level. */
export const PLACE_SLOTS = [1, 2] as const;

const isDocType = (v: unknown): v is DocType => v === "RDS" || v === "RIA" || v === "RAD";
const slotOf = (v: unknown, allowed: readonly number[]) => {
  const slot = Number(v);
  if (!allowed.includes(slot)) throw new HttpsError("invalid-argument", "A level has two box positions, 1 and 2.");
  return slot;
};

export const placeRecordDocument = onCall(async (request) => {
  const caller = await callerOf(request);
  requireRole(caller, ["Administrator"], "place records in the Records Room");
  const uid = caller.kind === "staff" ? caller.uid : null;
  const input = record(request.data ?? {});
  // The name the office knows them by, as the other functions record it; the account if none is sent.
  const by =
    text(input.by, "Name", { max: 200, optional: true })?.trim() ||
    (caller.kind === "staff" ? caller.email || caller.uid : "Administrator");
  if (!isDocType(input.type)) throw new HttpsError("invalid-argument", "Unknown records document type.");
  const type = input.type;
  const sourceId = requiredText(input.sourceId, "Document", 100);
  const levelId = requiredText(input.levelId, "Level", 100);
  const slot = slotOf(input.slot, PLACE_SLOTS);
  const spec = SPECS[type];
  const db = getFirestore();

  return db.runTransaction(async (tx) => {
    const docRef = db.collection(spec.collection).doc(sourceId);
    const levelRef = db.collection("record_shelf_levels").doc(levelId);
    const positionRef = db.collection("record_box_positions").doc(positionId(levelId, slot));
    const contentRef = db.collection("record_box_contents").doc(contentId(type, sourceId));
    const [doc, level, position, content] = await Promise.all([
      tx.get(docRef),
      tx.get(levelRef),
      tx.get(positionRef),
      tx.get(contentRef),
    ]);
    if (!doc.exists) throw new HttpsError("not-found", "That document no longer exists.");
    const number = String(doc.get(spec.numberField) ?? sourceId);
    // Only an approved form is filed; a voided one stays where it was, marked voided.
    if (doc.get("status") !== "Approved") {
      throw new HttpsError(
        "failed-precondition",
        `${number} is ${String(doc.get("status") ?? "not approved")}. Only an approved document is filed in the Records Room.`,
      );
    }
    if (!level.exists) throw new HttpsError("failed-precondition", "That shelf level no longer exists. Choose another box.");

    let boxId = position.exists ? String(position.get("box_id")) : null;
    if (boxId && content.exists && content.get("box_id") === boxId) {
      return { boxId, contentId: contentRef.id, moved: false };
    }

    const at = new Date().toISOString();
    if (!boxId) {
      // The position's first record: its box is made, named by position until the office names it.
      boxId = randomUUID();
      tx.create(db.collection("record_boxes").doc(boxId), {
        id: boxId,
        document_type: null,
        year: null,
        sequence: null,
        shelf_level_id: levelId,
        slot,
        label_override: null,
        capacity: null,
        created_at: at,
        updated_at: at,
        created_by_uid: uid,
      });
      tx.create(positionRef, { box_id: boxId, shelf_id: level.get("shelf_id"), level_id: levelId, slot });
    }

    const line = {
      document_type: type,
      source_id: sourceId,
      document_no: number,
      agency: String(doc.get(spec.agencyField) ?? ""),
      date: String(doc.get(spec.dateField) ?? ""),
      updated_at: at,
      updated_by_uid: uid,
    };
    if (content.exists) {
      tx.update(contentRef, {
        ...line,
        box_id: boxId,
        moves: FieldValue.arrayUnion({ from_box_id: String(content.get("box_id")), to_box_id: boxId, at, by, by_uid: uid }),
      });
    } else {
      tx.create(contentRef, {
        id: contentRef.id,
        box_id: boxId,
        ...line,
        filed_at: at,
        filed_by: by,
        created_by_uid: uid,
        moves: [],
      });
    }
    return { boxId, contentId: contentRef.id, moved: content.exists };
  });
});

/**
 * Names a shelf, a level or a box as the office calls it. A level or a box
 * with no name of its own reads "Level A", "Box 1". Naming an empty box
 * position makes its box, so the name stays with the position.
 */
export const renameRecordLocation = onCall(async (request) => {
  const caller = await callerOf(request);
  requireRole(caller, ["Administrator"], "rename places in the Records Room");
  const uid = caller.kind === "staff" ? caller.uid : null;
  const input = record(request.data ?? {});
  const name = text(input.name, "Name", { max: 120, optional: true })?.trim() || null;
  const db = getFirestore();
  const at = new Date().toISOString();

  if (input.kind === "shelf") {
    const id = requiredText(input.id, "Shelf", 100);
    if (!name) throw new HttpsError("invalid-argument", "Give the shelf a name — what the office calls it out loud.");
    await db.runTransaction(async (tx) => {
      const shelf = await tx.get(db.collection("record_shelves").doc(id));
      if (!shelf.exists) throw new HttpsError("not-found", "That shelf no longer exists.");
      tx.update(shelf.ref, { name, updated_at: at, updated_by_uid: uid });
    });
    return { kind: "shelf", id, name };
  }

  if (input.kind === "level") {
    const id = requiredText(input.id, "Level", 100);
    await db.runTransaction(async (tx) => {
      const level = await tx.get(db.collection("record_shelf_levels").doc(id));
      if (!level.exists) throw new HttpsError("not-found", "That shelf level no longer exists.");
      tx.update(level.ref, { name, updated_at: at, updated_by_uid: uid });
    });
    return { kind: "level", id, name };
  }

  if (input.kind === "box") {
    const levelId = requiredText(input.levelId, "Level", 100);
    // A box still standing in an old third position can be named; a new one is made only in 1 or 2.
    const slot = slotOf(input.slot, [1, 2, 3]);
    const boxId = await db.runTransaction(async (tx) => {
      const positionRef = db.collection("record_box_positions").doc(positionId(levelId, slot));
      const [level, position] = await Promise.all([
        tx.get(db.collection("record_shelf_levels").doc(levelId)),
        tx.get(positionRef),
      ]);
      if (!level.exists) throw new HttpsError("not-found", "That shelf level no longer exists.");
      if (position.exists) {
        const id = String(position.get("box_id"));
        tx.update(db.collection("record_boxes").doc(id), { label_override: name, updated_at: at, updated_by_uid: uid });
        return id;
      }
      if (!PLACE_SLOTS.includes(slot as 1 | 2)) throw new HttpsError("invalid-argument", "A level has two box positions, 1 and 2.");
      const id = randomUUID();
      tx.create(db.collection("record_boxes").doc(id), {
        id,
        document_type: null,
        year: null,
        sequence: null,
        shelf_level_id: levelId,
        slot,
        label_override: name,
        capacity: null,
        created_at: at,
        updated_at: at,
        created_by_uid: uid,
      });
      tx.create(positionRef, { box_id: id, shelf_id: level.get("shelf_id"), level_id: levelId, slot });
      return id;
    });
    return { kind: "box", id: boxId, name };
  }

  throw new HttpsError("invalid-argument", "Rename a shelf, a level or a box.");
});
