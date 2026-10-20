import { fetchAll, friendlyDbError, requireDb, unwrap } from "@/lib/db";
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
 * The Records Room's furniture and what stands on it. Shelves are added and
 * named here; their five levels come with them (migration 047). Boxes are
 * created and filled by the database when a document is approved — the only
 * writes the app makes to a box are moving it and correcting its label.
 * Components never call Supabase directly.
 */

const SHELVES = "record_shelves";
const LEVELS = "record_shelf_levels";
const BOXES = "record_boxes";
const CONTENTS = "record_box_contents";

const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

/* eslint-disable @typescript-eslint/no-explicit-any */
function one<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

export function rowToLevel(r: any): ShelfLevel {
  return { id: r.id, shelfId: r.shelf_id, label: r.label, position: r.position };
}

export function rowToBox(r: any): RecordBox {
  return {
    id: r.id,
    documentType: r.document_type,
    year: r.year,
    sequence: r.sequence,
    shelfLevelId: r.shelf_level_id,
    slot: r.slot,
    labelOverride: r.label_override ?? undefined,
  };
}

function rowToContent(r: any): BoxContent | null {
  const base = { id: r.id, boxId: r.box_id, filedAt: r.filed_at };
  const rds = one<any>(r.disposition_schedules);
  if (r.schedule_id && rds)
    return {
      ...base, documentType: "RDS", sourceId: r.schedule_id, documentNo: rds.schedule_no,
      agency: rds.agency_name ?? "", date: rds.date_prepared ?? "",
    };
  const ria = one<any>(r.inventory_appraisals);
  if (r.appraisal_id && ria)
    return {
      ...base, documentType: "RIA", sourceId: r.appraisal_id, documentNo: ria.inventory_no,
      agency: ria.office_name ?? "", date: ria.date_prepared ?? "",
    };
  const rad = one<any>(r.disposal_requests);
  if (r.disposal_id && rad)
    return {
      ...base, documentType: "RAD", sourceId: r.disposal_id, documentNo: rad.request_no,
      agency: rad.agency_name ?? "", date: rad.request_date ?? "",
    };
  return null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Every shelf with its levels A–E, in the order the room is walked. */
export async function listShelves(): Promise<ShelfWithLevels[]> {
  const db = requireDb();
  const shelfRows = await fetchAll<Record<string, unknown>>((from, to) =>
    db
      .from(SHELVES)
      .select("*")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .range(from, to),
  );
  if (shelfRows.length === 0) return [];

  const levelRows = await fetchAll<Record<string, unknown>>((from, to) =>
    db.from(LEVELS).select("*").order("label", { ascending: true }).range(from, to),
  );
  const byShelf = new Map<string, ShelfLevel[]>();
  for (const row of levelRows) {
    const level = rowToLevel(row);
    const list = byShelf.get(level.shelfId);
    if (list) list.push(level);
    else byShelf.set(level.shelfId, [level]);
  }

  return shelfRows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    location: (r.location as string | null) ?? undefined,
    position: r.position as number,
    levels: byShelf.get(r.id as string) ?? [],
  }));
}

export async function listBoxes(): Promise<RecordBox[]> {
  const db = requireDb();
  const rows = await fetchAll<Record<string, unknown>>((from, to) =>
    db
      .from(BOXES)
      .select("*")
      .order("document_type", { ascending: true })
      .order("year", { ascending: true })
      .order("sequence", { ascending: true })
      .range(from, to),
  );
  return rows.map(rowToBox);
}

/**
 * Every filed document, with what its own form says about it. The documents
 * are read from their own tables through the references; nothing about them
 * is stored twice.
 */
export async function listContents(): Promise<BoxContent[]> {
  const db = requireDb();
  const rows = await fetchAll<Record<string, unknown>>((from, to) =>
    db
      .from(CONTENTS)
      .select(
        `id, box_id, schedule_id, appraisal_id, disposal_id, filed_at,
         disposition_schedules(schedule_no, agency_name, date_prepared),
         inventory_appraisals(inventory_no, office_name, date_prepared),
         disposal_requests(request_no, agency_name, request_date)`,
      )
      .order("filed_at", { ascending: true })
      .range(from, to),
  );
  return rows.map(rowToContent).filter((c): c is BoxContent => c !== null);
}

/** The box a document was filed in, or null while it is not filed. */
export async function findFiledBox(type: DocType, sourceId: string): Promise<string | null> {
  const db = requireDb();
  const column = type === "RDS" ? "schedule_id" : type === "RIA" ? "appraisal_id" : "disposal_id";
  const row = unwrap(
    await db.from(CONTENTS).select("box_id").eq(column, sourceId).maybeSingle(),
  ) as { box_id: string } | null;
  return row?.box_id ?? null;
}

/* ---------------- shelves ---------------- */

/** Adds a shelf. The database gives it levels A–E as it is created. */
export async function createShelf(input: ShelfInput, position: number): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new Error("Give the shelf a name — what the office calls it out loud.");
  const db = requireDb();
  const ts = nowIso();
  unwrap(
    await db
      .from(SHELVES)
      .insert({
        id: uid(),
        name,
        location: input.location?.trim() || null,
        position,
        created_at: ts,
        updated_at: ts,
      })
      .select(),
  );
}

export async function updateShelf(id: string, input: ShelfInput): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new Error("Give the shelf a name — what the office calls it out loud.");
  const db = requireDb();
  unwrap(
    await db
      .from(SHELVES)
      .update({ name, location: input.location?.trim() || null, updated_at: nowIso() })
      .eq("id", id)
      .select(),
  );
}

/**
 * Removes an empty shelf. The database refuses while any box stands on it —
 * the boxes, and the documents in them, have to be moved first.
 */
export async function deleteShelf(id: string): Promise<void> {
  const db = requireDb();
  const { error } = await db.from(SHELVES).delete().eq("id", id).select();
  if (error) {
    if (String((error as { message?: string }).message).includes("record_boxes")) {
      throw new Error("Boxes still stand on this shelf. Move them to another shelf first.");
    }
    throw friendlyDbError(error);
  }
}

/* ---------------- boxes ---------------- */

/**
 * Moves a box, and everything in it, to another position. The database holds
 * one box per position, so a taken position is refused rather than doubled.
 */
export async function moveBox(boxId: string, levelId: string, slot: Slot): Promise<void> {
  const db = requireDb();
  const { error } = await db
    .from(BOXES)
    .update({ shelf_level_id: levelId, slot, updated_at: nowIso() })
    .eq("id", boxId)
    .select();
  if (error) {
    if (String((error as { message?: string }).message).includes("record_boxes_position_unique")) {
      throw new Error("Another box already stands in that position. Choose an empty one.");
    }
    throw friendlyDbError(error);
  }
}

/** Corrects a box's printed name; an empty label goes back to the generated one. */
export async function relabelBox(boxId: string, label: string): Promise<void> {
  const db = requireDb();
  unwrap(
    await db
      .from(BOXES)
      .update({ label_override: label.trim() || null, updated_at: nowIso() })
      .eq("id", boxId)
      .select(),
  );
}
