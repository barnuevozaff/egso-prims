import { byFields, callFunction, getRow, listWhere, updateRow } from "@/lib/firestore";
import { rowToBox, rowToLevel } from "@/features/records/shelf-api.supabase";
import type {
  BoxContent,
  DocType,
  RecordBox,
  ShelfInput,
  ShelfLevel,
  ShelfWithLevels,
  Slot,
} from "@/features/records/shelf-types";

/**
 * The Records Room on Firestore. Same signatures as shelf-api.supabase.ts.
 * Boxes are made and filled by the saveRecordsDocument Cloud Function when a
 * form is approved; adding or removing a shelf and moving a box go through
 * functions too, so one box per position and five levels per shelf hold
 * under simultaneous use. Renaming a shelf and correcting a box label are
 * plain writes (firestore.rules allow nothing else).
 */

const SHELVES = "record_shelves";
const LEVELS = "record_shelf_levels";
const BOXES = "record_boxes";
const CONTENTS = "record_box_contents";
const nowIso = () => new Date().toISOString();
const SHELF_NAME = "Give the shelf a name — what the office calls it out loud.";

export async function listShelves(): Promise<ShelfWithLevels[]> {
  const shelves = await listWhere(SHELVES, {}, byFields("position", "created_at"));
  if (shelves.length === 0) return [];
  const byShelf = new Map<string, ShelfLevel[]>();
  for (const row of await listWhere(LEVELS, {}, byFields("label"))) {
    const level = rowToLevel(row);
    byShelf.set(level.shelfId, [...(byShelf.get(level.shelfId) ?? []), level]);
  }
  return shelves.map((r) => ({
    id: r.id,
    name: String(r.name),
    location: (r.location as string | null) ?? undefined,
    position: Number(r.position ?? 0),
    levels: byShelf.get(r.id) ?? [],
  }));
}

export async function listBoxes(): Promise<RecordBox[]> {
  return (await listWhere(BOXES, {}, byFields("document_type", "year", "sequence"))).map(rowToBox);
}

/**
 * Every filed document. Each contents line carries the document's number,
 * agency and date, kept in step by the function on every save of the form.
 */
export async function listContents(): Promise<BoxContent[]> {
  // A voided form stays in its box for the record, but not among the active ones.
  return (await listWhere(CONTENTS, {}, byFields("filed_at"))).filter((r) => r.voided !== true).map((r) => ({
    id: r.id,
    boxId: String(r.box_id),
    documentType: r.document_type as DocType,
    sourceId: String(r.source_id),
    documentNo: String(r.document_no ?? ""),
    agency: String(r.agency ?? ""),
    date: String(r.date ?? ""),
    filedAt: String(r.filed_at),
  }));
}

export async function findFiledBox(type: DocType, sourceId: string): Promise<string | null> {
  const row = await getRow(CONTENTS, `${type}-${sourceId}`);
  return row ? String(row.box_id) : null;
}

/* ---------------- shelves ---------------- */

export async function createShelf(input: ShelfInput, position: number): Promise<void> {
  if (!input.name.trim()) throw new Error(SHELF_NAME);
  await callFunction("createRecordShelf", { name: input.name.trim(), location: input.location?.trim() || null, position });
}

export async function updateShelf(id: string, input: ShelfInput): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new Error(SHELF_NAME);
  await updateRow(SHELVES, id, `Shelf not found: ${id}`, () => ({
    name,
    location: input.location?.trim() || null,
    updated_at: nowIso(),
  }));
}

/** Removes an empty shelf with its levels; refused while any box stands on it. */
export async function deleteShelf(id: string): Promise<void> {
  await callFunction("deleteRecordShelf", { id });
}

/* ---------------- boxes ---------------- */

export async function moveBox(boxId: string, levelId: string, slot: Slot): Promise<void> {
  await callFunction("moveRecordBox", { boxId, levelId, slot });
}

export async function relabelBox(boxId: string, label: string): Promise<void> {
  await updateRow(BOXES, boxId, `Box not found: ${boxId}`, () => ({
    label_override: label.trim() || null,
    updated_at: nowIso(),
  }));
}
