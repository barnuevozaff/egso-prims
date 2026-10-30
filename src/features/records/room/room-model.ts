import type { RecordsDocStatus } from "@/features/records/types";
import {
  DOC_TYPES,
  LEVEL_LABELS,
  PLACE_SLOTS,
  boxName,
  levelTitle,
  type BoxContent,
  type DocType,
  type RecordBox,
  type ShelfLevel,
  type ShelfWithLevels,
} from "@/features/records/shelf-types";

/**
 * The Records Room as one picture (30 Oct 2026): every shelf with its five
 * levels and their box positions, what stands in each, and the documents
 * still to be placed. Built from what Firestore holds — the shelves, the
 * boxes, the box lines and the three registers — and nothing else.
 */

/** A Records Management document as the registers list it. */
export interface CatalogDoc {
  type: DocType;
  id: string;
  /** RDS-2026-000003, RIA-…, RAD-… */
  number: string;
  /** The agency or office the form names. */
  title: string;
  /** yyyy-MM-dd: date prepared, or the request date. */
  date: string;
  status: RecordsDocStatus;
}

/** Statuses of a form not yet approved: it is not filed, whatever happens on screen. */
export const AWAITING: RecordsDocStatus[] = ["Draft", "Submitted", "Returned"];

export const docKey = (type: DocType, id: string) => `${type}-${id}`;
/** The kinds of form in a box, in a fixed order, once each. */
export const kindsIn = (types: DocType[]): DocType[] => (["RDS", "RIA", "RAD"] as DocType[]).filter((t) => types.includes(t));
export const positionKey = (levelId: string, slot: number) => `${levelId}~${slot}`;

export interface RoomPosition {
  /** `{levelId}~{slot}`: fixed, whatever the box is called. */
  key: string;
  levelId: string;
  slot: number;
  box?: RecordBox;
  /** "Procurement Archives 2026", or "Box 1". */
  name: string;
  items: BoxContent[];
  /** A third position from before 30 Oct 2026: shown while a box stands there, never offered. */
  legacy: boolean;
}

export interface RoomLevel {
  level: ShelfLevel;
  /** "Administrative Records", or "Level A". */
  title: string;
  positions: RoomPosition[];
}

export interface RoomShelf {
  shelf: ShelfWithLevels;
  levels: RoomLevel[];
  records: number;
  boxesInUse: number;
}

export interface Placement {
  shelf: RoomShelf;
  level: RoomLevel;
  position: RoomPosition;
  content: BoxContent;
}

export interface RoomModel {
  shelves: RoomShelf[];
  /** Where each placed document is, by `{type}-{id}`. */
  placed: Map<string, Placement>;
  /** Approved, and in no box yet. */
  unplaced: CatalogDoc[];
  /** Not approved yet: cannot be filed. */
  awaiting: CatalogDoc[];
  /** Every document the registers hold, by `{type}-{id}`. */
  catalog: Map<string, CatalogDoc>;
  /** Positions by key, with their shelf and level. */
  positions: Map<string, { shelf: RoomShelf; level: RoomLevel; position: RoomPosition }>;
  /** Box names by box ID, for a record's move history. */
  boxNames: Map<string, string>;
}

const newestFirst = (a: CatalogDoc, b: CatalogDoc) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number);

export function buildRoom(input: {
  shelves: ShelfWithLevels[];
  boxes: RecordBox[];
  contents: BoxContent[];
  catalog: CatalogDoc[];
}): RoomModel {
  const boxAt = new Map<string, RecordBox>();
  for (const box of input.boxes) boxAt.set(positionKey(box.shelfLevelId, box.slot), box);
  const itemsIn = new Map<string, BoxContent[]>();
  for (const c of input.contents) itemsIn.set(c.boxId, [...(itemsIn.get(c.boxId) ?? []), c]);

  const placed = new Map<string, Placement>();
  const positions: RoomModel["positions"] = new Map();
  const shelves: RoomShelf[] = input.shelves.map((shelf) => {
    const room: RoomShelf = { shelf, levels: [], records: 0, boxesInUse: 0 };
    const levels = [...shelf.levels].sort((a, b) => LEVEL_LABELS.indexOf(a.label as never) - LEVEL_LABELS.indexOf(b.label as never));
    room.levels = levels.map((level) => {
      const row: RoomLevel = { level, title: levelTitle(level), positions: [] };
      // Two positions a level; a third only while a box from before still stands in it.
      const slots = [...PLACE_SLOTS, ...(boxAt.has(positionKey(level.id, 3)) ? [3] : [])];
      row.positions = slots.map((slot) => {
        const key = positionKey(level.id, slot);
        const box = boxAt.get(key);
        const items = (box ? (itemsIn.get(box.id) ?? []) : []).sort((a, b) => a.documentNo.localeCompare(b.documentNo));
        return { key, levelId: level.id, slot, box, name: box ? boxName(box) : `Box ${slot}`, items, legacy: slot > 2 };
      });
      return row;
    });
    for (const level of room.levels) {
      for (const position of level.positions) {
        positions.set(position.key, { shelf: room, level, position });
        room.records += position.items.length;
        if (position.items.length) room.boxesInUse += 1;
        for (const content of position.items) {
          placed.set(docKey(content.documentType, content.sourceId), { shelf: room, level, position, content });
        }
      }
    }
    return room;
  });

  const catalog = new Map(input.catalog.map((d) => [docKey(d.type, d.id), d]));
  const unplaced = input.catalog
    .filter((d) => d.status === "Approved" && !placed.has(docKey(d.type, d.id)))
    .sort(newestFirst);
  const awaiting = input.catalog.filter((d) => AWAITING.includes(d.status)).sort(newestFirst);
  const boxNames = new Map(input.boxes.map((b) => [b.id, boxName(b)]));

  return { shelves, placed, unplaced, awaiting, catalog, positions, boxNames };
}

/** "Shelf 1 › Administrative Records › Box 2" */
export function placeText(p: Pick<Placement, "shelf" | "level" | "position">): string {
  return `${p.shelf.shelf.name} › ${p.level.title} › ${p.position.name}`;
}

export type SearchHit =
  | { kind: "placed"; doc: CatalogDoc; placement: Placement }
  | { kind: "unplaced"; doc: CatalogDoc }
  | { kind: "awaiting"; doc: CatalogDoc };

/**
 * Finds documents by number, office or agency, kind, status, or the name of
 * the shelf, level or box they are in. Every word must match. Placed records
 * come first, then unplaced, then those awaiting approval; voided ones are
 * left out.
 */
export function searchRoom(model: RoomModel, query: string, limit = 20): SearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const [key, doc] of model.catalog) {
    const placement = model.placed.get(key);
    const kind = placement ? "placed" : doc.status === "Approved" ? "unplaced" : AWAITING.includes(doc.status) ? "awaiting" : null;
    if (!kind) continue;
    const haystack = [
      doc.number,
      doc.title,
      doc.status,
      DOC_TYPES[doc.type].name,
      DOC_TYPES[doc.type].short,
      placement ? placeText(placement) : "",
    ]
      .join(" ")
      .toLowerCase();
    if (!words.every((w) => haystack.includes(w))) continue;
    hits.push(kind === "placed" ? { kind, doc, placement: placement! } : { kind, doc });
  }
  const rank = { placed: 0, unplaced: 1, awaiting: 2 } as const;
  return hits
    .sort((a, b) => rank[a.kind] - rank[b.kind] || a.doc.number.localeCompare(b.doc.number))
    .slice(0, limit);
}
