import { randomUUID } from "node:crypto";

import { getFirestore, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { callerOf, requireRole } from "../documents/caller.js";
import { record, requiredText, text } from "../documents/validate.js";

/**
 * The Records Room (migrations 044, 047, 048): shelves with levels A–E,
 * three box positions per level, boxes holding one kind of document for one
 * year, and the approved documents filed in them.
 *
 * Postgres guaranteed one box per position and one Box 01 per kind and year
 * with unique constraints and an advisory lock. Here the same comes from
 * document IDs:
 *   record_boxes/{type}-{year}-{seq}           one box per kind, year, number
 *   record_box_positions/{levelId}~{slot}      one box per position
 *   record_box_contents/{type}-{documentId}    one place per document
 *   record_shelf_levels/{shelfId}-{A..E}       five levels per shelf
 * so two approvals at the same moment cannot both start a box or take the
 * same position: the second transaction finds the document the first wrote.
 */

export type DocType = "RDS" | "RIA" | "RAD";
type Row = Record<string, unknown>;

export const LEVEL_LABELS = ["A", "B", "C", "D", "E"] as const;
export const SLOTS = [1, 2, 3] as const;

export const boxId = (type: DocType, year: number, seq: number) => `${type}-${year}-${String(seq).padStart(2, "0")}`;
export const positionId = (levelId: string, slot: number) => `${levelId}~${slot}`;
export const contentId = (type: DocType, sourceId: string) => `${type}-${sourceId}`;
export const levelId = (shelfId: string, label: string) => `${shelfId}-${label}`;

const db = () => getFirestore();

/** What a box's contents line shows: copied from the document, kept in step on every save. */
export interface Filing {
  type: DocType;
  sourceId: string;
  documentNo: string;
  agency: string;
  date: string;
}

/**
 * Everything filing may need, read up front: Firestore transactions read
 * before they write. The room is small (a few shelves of fifteen positions),
 * so reading all of it is cheaper than being clever.
 */
export interface RoomState {
  shelves: DocumentSnapshot[];
  levels: DocumentSnapshot[];
  positions: Set<string>;
}

export async function readRoom(tx: Transaction): Promise<RoomState> {
  const [shelves, levels, positions] = await Promise.all([
    tx.get(db().collection("record_shelves")),
    tx.get(db().collection("record_shelf_levels")),
    tx.get(db().collection("record_box_positions")),
  ]);
  return { shelves: shelves.docs, levels: levels.docs, positions: new Set(positions.docs.map((d) => d.id)) };
}

const createdAt = (d: DocumentSnapshot) => String(d.get("created_at") ?? "");

/**
 * record_first_free_position (048): shelves in their order, levels A–E,
 * positions 1–3. When every position is taken a shelf is added — returned
 * here, written by the caller — named "Shelf N".
 */
export function firstFreePosition(room: RoomState, at: string): {
  levelId: string;
  shelfId: string;
  slot: number;
  newShelf?: Row;
} {
  const shelves = [...room.shelves].sort(
    (a, b) => Number(a.get("position") ?? 0) - Number(b.get("position") ?? 0) || createdAt(a).localeCompare(createdAt(b)),
  );
  for (const shelf of shelves) {
    const levels = room.levels
      .filter((l) => l.get("shelf_id") === shelf.id)
      .sort((a, b) => String(a.get("label")).localeCompare(String(b.get("label"))));
    for (const level of levels) {
      for (const slot of SLOTS) {
        if (!room.positions.has(positionId(level.id, slot))) return { levelId: level.id, shelfId: shelf.id, slot };
      }
    }
  }
  const shelfId = randomUUID();
  const position = shelves.reduce((m, s) => Math.max(m, Number(s.get("position") ?? 0) + 1), 0);
  return {
    levelId: levelId(shelfId, "A"),
    shelfId,
    slot: 1,
    newShelf: { id: shelfId, name: `Shelf ${room.shelves.length + 1}`, location: null, position, created_at: at, updated_at: at },
  };
}

/** Writes a shelf and its five levels (record_shelf_add_levels). */
export function writeShelf(tx: Transaction, shelf: Row, uid: string | null): void {
  const at = String(shelf.created_at);
  tx.create(db().collection("record_shelves").doc(String(shelf.id)), { ...shelf, created_by_uid: uid });
  LEVEL_LABELS.forEach((label, i) => {
    const id = levelId(String(shelf.id), label);
    tx.create(db().collection("record_shelf_levels").doc(id), {
      id,
      shelf_id: shelf.id,
      label,
      position: i,
      created_at: at,
      updated_at: at,
      created_by_uid: uid,
    });
  });
}

/** What filing needs to know about the document's kind and year, read in advance. */
export interface FilingReads {
  content: DocumentSnapshot;
  counter: DocumentSnapshot;
  currentBox: DocumentSnapshot | null;
  currentBoxCount: number;
  room: RoomState;
}

export async function readForFiling(tx: Transaction, type: DocType, sourceId: string, year: number): Promise<FilingReads> {
  const content = await tx.get(db().collection("record_box_contents").doc(contentId(type, sourceId)));
  const counter = await tx.get(db().doc(`document_counters/BOX-${type}-${year}`));
  const seq = counter.exists ? Number(counter.get("current_sequence")) : 0;
  const currentBox = seq ? await tx.get(db().collection("record_boxes").doc(boxId(type, year, seq))) : null;
  // Capacity is null until the office measures a real box; only then is
  // counting what is inside needed.
  const capacity = currentBox?.get("capacity");
  // Voided forms stay in their box for the record but no longer take room.
  const currentBoxCount =
    currentBox?.exists && typeof capacity === "number"
      ? (await tx.get(db().collection("record_box_contents").where("box_id", "==", currentBox.id))).docs.filter(
          (d) => d.get("voided") !== true,
        ).length
      : 0;
  return { content, counter, currentBox: currentBox?.exists ? currentBox : null, currentBoxCount, room: await readRoom(tx) };
}

/**
 * record_file_document (047): puts an approved document in the current box
 * for its kind and year, starting a box — in the first free position, adding
 * a shelf if the room is full — when there is none or it is full. A document
 * already filed only has its contents line brought up to date.
 */
export function fileDocument(
  tx: Transaction,
  filing: Filing,
  year: number,
  reads: FilingReads,
  uid: string | null,
  at: string,
): void {
  const contents = db().collection("record_box_contents").doc(contentId(filing.type, filing.sourceId));
  const line = {
    document_type: filing.type,
    source_id: filing.sourceId,
    document_no: filing.documentNo,
    agency: filing.agency,
    date: filing.date,
    updated_at: at,
    updated_by_uid: uid,
  };
  if (reads.content.exists) {
    tx.update(contents, line);
    return;
  }

  const box = reads.currentBox;
  const capacity = box?.get("capacity");
  const full = typeof capacity === "number" && reads.currentBoxCount >= capacity;
  let id = box?.id;
  if (!box || full) {
    const seq = (reads.counter.exists ? Number(reads.counter.get("current_sequence")) : 0) + 1;
    const pos = firstFreePosition(reads.room, at);
    if (pos.newShelf) writeShelf(tx, pos.newShelf, uid);
    id = boxId(filing.type, year, seq);
    tx.create(db().collection("record_boxes").doc(id), {
      id,
      document_type: filing.type,
      year,
      sequence: seq,
      shelf_level_id: pos.levelId,
      slot: pos.slot,
      label_override: null,
      capacity: null,
      created_at: at,
      updated_at: at,
      created_by_uid: uid,
    });
    tx.create(db().collection("record_box_positions").doc(positionId(pos.levelId, pos.slot)), {
      box_id: id,
      shelf_id: pos.shelfId,
      level_id: pos.levelId,
      slot: pos.slot,
    });
    tx.set(reads.counter.ref, { document_type: `BOX-${filing.type}`, year, current_sequence: seq, updated_at: new Date() });
  }
  tx.create(contents, { id: contents.id, box_id: id, ...line, filed_at: at, created_by_uid: uid });
}

/** A document leaving Approved, or deleted, comes out of its box; the box stays. */
export function unfileDocument(tx: Transaction, reads: Pick<FilingReads, "content">): void {
  if (reads.content.exists) tx.delete(reads.content.ref);
}

/* ---------------- shelves and boxes ---------------- */

const SHELF_NAME = "Give the shelf a name — what the office calls it out loud.";

/** Adds a shelf with its levels A–E. */
export const createRecordShelf = onCall(async (request) => {
  const caller = await callerOf(request);
  requireRole(caller, ["Administrator"], "change the Records Room");
  const input = record(request.data ?? {});
  const name = text(input.name, "Shelf name", { max: 120, optional: true })?.trim();
  if (!name) throw new HttpsError("invalid-argument", SHELF_NAME);
  const location = text(input.location, "Location", { max: 200, optional: true })?.trim() || null;
  const position = Number(input.position ?? 0);
  if (!Number.isInteger(position) || position < 0) throw new HttpsError("invalid-argument", "Position must be a whole number.");
  const at = new Date().toISOString();
  const shelf = { id: randomUUID(), name, location, position, created_at: at, updated_at: at };
  const uid = caller.kind === "staff" ? caller.uid : null;
  await db().runTransaction(async (tx) => writeShelf(tx, shelf, uid));
  return shelf;
});

/**
 * Removes a shelf that holds no records, with its levels and its empty
 * (perhaps named) boxes. Refused while any record — a voided one included —
 * is in a box on it: its records are moved to another shelf first
 * (30 Oct 2026; before, any box at all refused it).
 */
export const deleteRecordShelf = onCall(async (request) => {
  const caller = await callerOf(request);
  requireRole(caller, ["Administrator"], "change the Records Room");
  const id = requiredText(record(request.data ?? {}).id, "Shelf", 100);
  await db().runTransaction(async (tx) => {
    const shelf = await tx.get(db().collection("record_shelves").doc(id));
    if (!shelf.exists) throw new HttpsError("not-found", "That shelf no longer exists.");
    const positions = await tx.get(db().collection("record_box_positions").where("shelf_id", "==", id));
    const boxIds = positions.docs.map((p) => String(p.get("box_id")));
    for (const boxId of boxIds) {
      const held = await tx.get(db().collection("record_box_contents").where("box_id", "==", boxId).limit(1));
      if (!held.empty) {
        throw new HttpsError("failed-precondition", "Records are still filed on this shelf. Move them to another shelf first.");
      }
    }
    const levels = await tx.get(db().collection("record_shelf_levels").where("shelf_id", "==", id));
    positions.docs.forEach((p) => tx.delete(p.ref));
    boxIds.forEach((boxId) => tx.delete(db().collection("record_boxes").doc(boxId)));
    levels.docs.forEach((l) => tx.delete(l.ref));
    tx.delete(shelf.ref);
  });
  return { id };
});

/**
 * Moves a box, and everything in it, to another position. One box per
 * position: a taken position is refused rather than doubled.
 */
export const moveRecordBox = onCall(async (request) => {
  const caller = await callerOf(request);
  requireRole(caller, ["Administrator"], "move boxes");
  const input = record(request.data ?? {});
  const id = requiredText(input.boxId, "Box", 100);
  const level = requiredText(input.levelId, "Level", 100);
  const slot = Number(input.slot);
  if (!SLOTS.includes(slot as 1 | 2 | 3)) throw new HttpsError("invalid-argument", "A level has positions 1 to 3.");
  const uid = caller.kind === "staff" ? caller.uid : null;
  await db().runTransaction(async (tx) => {
    const box = await tx.get(db().collection("record_boxes").doc(id));
    if (!box.exists) throw new HttpsError("not-found", "That box no longer exists.");
    const levelSnap = await tx.get(db().collection("record_shelf_levels").doc(level));
    if (!levelSnap.exists) throw new HttpsError("failed-precondition", "That shelf level no longer exists.");
    const target = db().collection("record_box_positions").doc(positionId(level, slot));
    const taken = await tx.get(target);
    const from = positionId(String(box.get("shelf_level_id")), Number(box.get("slot")));
    if (target.id === from) return;
    if (taken.exists) {
      throw new HttpsError("failed-precondition", "Another box already stands in that position. Choose an empty one.");
    }
    tx.delete(db().collection("record_box_positions").doc(from));
    tx.create(target, { box_id: id, shelf_id: levelSnap.get("shelf_id"), level_id: level, slot });
    tx.update(box.ref, { shelf_level_id: level, slot, updated_at: new Date().toISOString(), updated_by_uid: uid });
  });
  return { id };
});
