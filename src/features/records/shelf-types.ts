/**
 * The Records Room: one room, its shelves, and the boxes on them.
 *
 * Since 30 Oct 2026 every shelf has five levels, A to E, and two box
 * positions on each: ten boxes a shelf. An approved document is placed in a
 * box by hand (placeRecordDocument); until then it waits among the Unplaced
 * records. Shelves, levels and boxes carry names the office gives them, but
 * are stored by IDs that never change, so renaming moves nothing.
 *
 * Before, a level had three positions and approval filed each document in a
 * box for its kind and year ("Records Disposition Schedule — 2026 — Box 01").
 * Those boxes and what is in them stay where they are; a box still standing
 * in a third position shows until its records are moved, and nothing new is
 * placed there.
 */

/** The three kinds of document the room keeps, by the codes their numbers use. */
export type DocType = "RDS" | "RIA" | "RAD";

export const DOC_TYPES: Record<
  DocType,
  { name: string; short: string; route: (id: string) => string }
> = {
  RDS: {
    name: "Records Disposition Schedule",
    short: "Disposition Schedule",
    route: (id) => `/records/${id}`,
  },
  RIA: {
    name: "Records Inventory and Appraisal",
    short: "Inventory & Appraisal",
    route: (id) => `/records/inventory/${id}`,
  },
  RAD: {
    name: "Request for Authority to Dispose of Records",
    short: "Authority to Dispose",
    route: (id) => `/records/disposal/${id}`,
  },
};

export const LEVEL_LABELS = ["A", "B", "C", "D", "E"] as const;
/** Every position a box has ever stood in: the third only on shelves from before 30 Oct 2026. */
export const SLOTS = [1, 2, 3] as const;
export type Slot = (typeof SLOTS)[number];
/** Where a record is placed now: two boxes a level. */
export const PLACE_SLOTS = [1, 2] as const;

/** How many boxes one shelf holds: five levels of two positions. */
export const POSITIONS_PER_SHELF = LEVEL_LABELS.length * PLACE_SLOTS.length;

/** One lettered floor of a shelf. */
export interface ShelfLevel {
  id: string;
  shelfId: string;
  /** A to E: the level's fixed coordinate. */
  label: string;
  /** What the office calls it, e.g. "Administrative Records". */
  name?: string;
  position: number;
}

/** A shelf standing in the room. */
export interface Shelf {
  id: string;
  name: string;
  /** Where in the room it stands, if the office says. */
  location?: string;
  position: number;
}

/** A shelf with its levels, A to E — what the room reads. */
export interface ShelfWithLevels extends Shelf {
  levels: ShelfLevel[];
}

export interface ShelfInput {
  name: string;
  location?: string;
}

/** A physical box standing in one position on one level. */
export interface RecordBox {
  id: string;
  /** Boxes filed by kind and year before 30 Oct 2026; a box made by placing has none. */
  documentType?: DocType;
  year?: number;
  /** Box 01, Box 02 … within one kind and year (boxes from before only). */
  sequence?: number;
  shelfLevelId: string;
  slot: Slot;
  /** The box's name, as the office labels it. */
  labelOverride?: string;
}

/** One move of a placed record, from one box to another. */
export interface BoxMove {
  fromBoxId: string;
  toBoxId: string;
  at: string;
  by?: string;
}

/** One approved document in a box, with what identifies it on its own form. */
export interface BoxContent {
  id: string;
  boxId: string;
  documentType: DocType;
  /** The document's own id, for its detail page. */
  sourceId: string;
  /** RDS-2026-000003, RIA-…, RAD-… */
  documentNo: string;
  /** Agency or office, as the form names it. */
  agency: string;
  /** yyyy-MM-dd: date prepared, or the request date. */
  date: string;
  filedAt: string;
  /** Who placed it, when placed by hand. */
  filedBy?: string;
  /** Every move since, oldest first. */
  moves: BoxMove[];
}

/** Where a box is, and the words for it. */
export interface BoxLocation {
  shelfId: string;
  shelfName: string;
  levelId: string;
  levelLabel: string;
  slot: Slot;
  /** "Shelf 1 → Level A → Box 1" */
  text: string;
}

/**
 * A box's name: the office's own, or "Records Disposition Schedule — 2026 —
 * Box 01" for a box filed by kind and year before, or "Box 1" by position.
 */
export function boxName(box: Pick<RecordBox, "labelOverride" | "documentType" | "year" | "sequence" | "slot">): string {
  if (box.labelOverride?.trim()) return box.labelOverride.trim();
  if (box.documentType && box.year && box.sequence) {
    return `${DOC_TYPES[box.documentType].name} — ${box.year} — Box ${String(box.sequence).padStart(2, "0")}`;
  }
  return `Box ${box.slot}`;
}

/** "2026 · Box 01" — the second line of a box from before; empty for a box made by placing. */
export function boxYearLine(box: RecordBox): string {
  return box.year && box.sequence ? `${box.year} · Box ${String(box.sequence).padStart(2, "0")}` : "";
}

/** A level's name: the office's own, or "Level A". */
export function levelTitle(level: Pick<ShelfLevel, "label" | "name">): string {
  return level.name?.trim() || `Level ${level.label}`;
}

export function locationOf(
  box: Pick<RecordBox, "shelfLevelId" | "slot"> | undefined,
  shelves: ShelfWithLevels[],
): BoxLocation | null {
  if (!box) return null;
  for (const shelf of shelves) {
    const level = shelf.levels.find((l) => l.id === box.shelfLevelId);
    if (!level) continue;
    return {
      shelfId: shelf.id,
      shelfName: shelf.name,
      levelId: level.id,
      levelLabel: level.label,
      slot: box.slot,
      text: `${shelf.name} → ${levelTitle(level)} → Box ${box.slot}`,
    };
  }
  return null;
}

/** What a level holds, named for the kind of document on it. */
const LEVEL_NAMES: Record<DocType, string> = {
  RDS: "Disposition Schedules",
  RIA: "Inventory & Appraisal",
  RAD: "Authority to Dispose",
};

/**
 * A level's name, read from the kinds of document filed on it now — pass the
 * type of each box on the level that holds at least one document. Never
 * stored, so it cannot fall out of step with the shelf: one kind gives that
 * kind's name; more than one gives "Mixed Records"; nothing filed gives
 * "Available Storage". The letter (A–E) stays the level's fixed coordinate.
 */
export function levelName(types: DocType[]): string {
  const kinds = new Set(types);
  if (kinds.size === 0) return "Available Storage";
  if (kinds.size > 1) return "Mixed Records";
  return LEVEL_NAMES[[...kinds][0]];
}

/** What can be renamed: a shelf, a level, or the box in one position. */
export type RenameTarget =
  | { kind: "shelf"; id: string }
  | { kind: "level"; id: string }
  | { kind: "box"; levelId: string; slot: number };

/** Where one document is filed, read for its own page. */
export interface DocumentLocation {
  shelfId: string;
  shelfName: string;
  levelTitle: string;
  boxName: string;
  /** `{levelId}~{slot}`, as the Records Room addresses a box. */
  positionKey: string;
  /** Voided after it was placed: it stays in its box, marked voided. */
  voided?: boolean;
}
